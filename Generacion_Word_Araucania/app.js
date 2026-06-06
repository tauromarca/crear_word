import { TemplateHandler } from "https://cdn.jsdelivr.net/npm/easy-template-x@7.2.4/+esm";
//import { TemplateHandler } from "easy-template-x";
require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/Graphic",
    "esri/identity/IdentityManager",
    "esri/identity/OAuthInfo",
    "esri/request"
], function (Map, MapView, FeatureLayer, Graphic, esriId, OAuthInfo, esriRequest) {

    const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_934bcaaf05a04d7f9e7dec476cf62b2f/FeatureServer/0";
    
    const status = document.getElementById("status");

    // Hallazgo 2.1: Sanitización de datos
    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }
    function aplicarCheckboxGenerico(obj, valor, opciones, prefijo) {

        opciones.forEach((opt, i) => {
            obj[`${prefijo}${i + 1}`] = "☐";
        });

        opciones.forEach((opt, i) => {

            if (valor == opt.code || valor === opt.label) {

                obj[`${prefijo}${i + 1}`] = "☑";

            }
        });
    }

    async function ejecutar() {
        const urlParams = new URLSearchParams(window.location.search);
        const oid = urlParams.get("objectid") || urlParams.get("oid");

        if (!oid) {
            status.textContent = "❌ Error: ID de registro no detectado.";
            return;
        }

        try {
            // 1. Autenticación OAuth2 (Corregida)
            const authInfo = new OAuthInfo({
                appId: "aeNAdAP7A0xhb786",
                portalUrl: "https://www.arcgis.com",
                popup: false
            });
            esriId.registerOAuthInfos([authInfo]);

            status.textContent = "🔐 Validando sesión con ArcGIS...";
            const credential = await esriId.getCredential(authInfo.portalUrl + "/sharing");

            // 2. Obtener Datos
            status.textContent = "📡 Recuperando información...";
            const layer = new FeatureLayer({ url: FS_URL });
            const result = await layer.queryFeatures({
                where: `objectid=${oid}`,
                outFields: ["*"],
                returnGeometry: true
            });

            if (!result.features.length) throw new Error("Registro no encontrado.");
            const feature = result.features[0];
            const raw = feature.attributes;

            // 3. Descargar Fotos
            status.textContent = "📸 Procesando adjuntos...";
            const attachments = await layer.queryAttachments({ objectIds: [oid] });
            const listaAdjuntos = attachments[oid] || [];
            const imagenesWord = [];

            for (const adj of listaAdjuntos) {
                if (adj.contentType.startsWith("image/")) {
                    const imgBlob = await fetch(adj.url).then(r => r.blob());
                    imagenesWord.push({
                        foto: { _type: "image", source: imgBlob, format: adj.contentType, width: 250, height: 180 },
                        nombre_imagen: adj.name
                    });
                }
            }

            // 4. Captura de Mapa
            status.textContent = "🗺️ Generando vista de mapa...";
            const view = new MapView({
                container: "map-view",
                map: new Map({ basemap: "hybrid" }),
                ui: { components: [] }
            });
            const punto = new Graphic({
                geometry: feature.geometry,
                symbol: {
                    type: "simple-marker",
                    color: "red",
                    size: 20,
                    outline: {
                        color: "white",
                        width: 2
                    }
                }
            });
            console.log("Geometría:", punto.geometry);
            console.log("Longitud:", punto.geometry.longitude);
            console.log("Latitud:", punto.geometry.latitude);
            view.graphics.add(punto);
            
            await view.when();
            
            view.center = [
                punto.geometry.longitude,
                punto.geometry.latitude
            ];
            
            view.zoom = 18;
            
            await new Promise(r => setTimeout(r, 3000));
            const screenshot = await view.takeScreenshot({ format: "png" });
            const mapBlob = await fetch(screenshot.dataUrl).then(r => r.blob());

            // 5. Lógica de Negocio (Checks y Tabla IV)
            const check = (v) => String(v || "").toLowerCase().includes("si") ? "☑" : "☐";
            
            // ORDENAMIENTO DE TABLA IV - Coincidiendo con los tags del Word
       
            // Objeto final para el template
            const datosFinales = {};
            Object.keys(raw).forEach(k => {
                let val = raw[k];
                if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                datosFinales[k] = sanitize(val);
            });

            // Hallazgo 2.2: Limpiar URL para privacidad
            if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);
            aplicarCheckboxGenerico(
                datosFinales,
                raw.A_TIPO_VISITA,
                [
                    { code: 1, label: "1° Visita" },
                    { code: 2, label: "2° Visita" },
                    { code: 3, label: "3° Visita" }
                ],
                "v"
            );
            aplicarCheckboxGenerico(datosFinales, raw.autorizacion, [
                { code: "Autoriza fotografías inmueble", label: "Autoriza fotografías inmueble" },
                { code: "No autoriza fotografías inmueble", label: "No autoriza fotografías inmueble" },
                { code: "Se deja Notificación", label: "Se deja Notificación" }
            ], "aut");

 

            // Inyectar lógicas específicas
            Object.assign(datosFinales, {
                //aut1: check(raw.autorizacion),
                //aut3: check(raw.inmueble),
                imagen: { _type: "image", source: mapBlob, format: "image/png", width: 500, height: 350 },
                imagenes_adjuntas: imagenesWord
            });

            // 6. Generar Word
            status.textContent = "📝 Construyendo documento final...";
            const templateBuffer = await fetch("template.docx").then(r => r.blob());
            const handler = new TemplateHandler();
            const docBlob = await handler.process(templateBuffer, datosFinales);

            window.saveAs(docBlob, `Reporte_Oficial_DTC_${oid}.docx`);

            status.innerHTML = "✅ ¡Éxito!<br><small>El documento se ha descargado.</small>";
            document.getElementById("loader").style.display = "none";

        } catch (error) {
            console.error(error);
            status.innerHTML = "❌ Error: " + error.message;
            document.getElementById("loader").style.display = "none";
        }
    }

    ejecutar();
});
