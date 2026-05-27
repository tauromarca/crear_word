import { TemplateHandler } from "https://cdn.jsdelivr.net/npm/easy-template-x@7.2.4/+esm";

require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/Graphic",
    "esri/identity/IdentityManager",
    "esri/identity/OAuthInfo",
    "esri/request"
], function (Map, MapView, FeatureLayer, Graphic, esriId, OAuthInfo, esriRequest) {

    const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_885775529ba244759922b6cef00631de_form/FeatureServer/0";
    const status = document.getElementById("status");

    async function ejecutar() {
        const params = new URLSearchParams(window.location.search);
        const oid = params.get("objectid") || params.get("oid");

        if (!oid) {
            status.textContent = "❌ Error: Falta ID de registro.";
            return;
        }

        try {
            // 1. Autenticación (SSO)
            const info = new OAuthInfo({
                appId: "aeNAdAP7A0xhb786",
                portalUrl: "https://www.arcgis.com",
                popup: false
            });
            esriId.registerOAuthInfos([authInfo]);

            status.textContent = "🔐 Validando sesión institucional...";
            await esriId.getCredential(info.portalUrl + "/sharing");

            // 2. Obtener Datos del Registro
            status.textContent = "📡 Recuperando datos de ArcGIS...";
            const layer = new FeatureLayer({ url: FS_URL });
            const result = await layer.queryFeatures({
                where: `objectid=${oid}`,
                outFields: ["*"],
                returnGeometry: true
            });

            if (!result.features.length) throw new Error("Registro no encontrado.");
            const feature = result.features[0];
            const atributos = feature.attributes;

            // 3. Obtener Adjuntos (Fotos)
            status.textContent = "📸 Descargando fotografías adjuntas...";
            const attachments = await layer.queryAttachments({ objectIds: [oid] });
            const listaAdjuntos = attachments[oid] || [];
            const imagenesWord = [];

            for (const adj of listaAdjuntos) {
                if (adj.contentType.startsWith("image/")) {
                    const response = await fetch(adj.url);
                    const blob = await response.blob();
                    imagenesWord.push({
                        foto: { _type: "image", source: blob, format: adj.contentType, width: 250, height: 180 },
                        nombre_imagen: adj.name
                    });
                }
            }

            // 4. Generar Captura del Mapa
            status.textContent = "🗺️ Generando mapa del polígono...";
            const view = new MapView({
                container: "map-view",
                map: new Map({ basemap: "hybrid" }),
                ui: { components: [] }
            });
            const graphic = new Graphic({
                geometry: feature.geometry,
                symbol: { type: "simple-fill", color: [255, 0, 0, 0.25], outline: { color: [255, 0, 0], width: 2 } }
            });
            view.graphics.add(graphic);
            await view.when();
            await view.goTo(graphic.geometry.extent.expand(2));
            
            // Esperar a que el mapa termine de renderizar para el screenshot
            await new Promise(r => setTimeout(r, 2000));
            const screenshot = await view.takeScreenshot({ format: "png" });
            const mapImageBlob = await (await fetch(screenshot.dataUrl)).blob();

            // 5. Preparar Datos para Template
            const valorCheck = (v) => String(v || "").toLowerCase().includes("si") ? "☑" : "☐";
            const datosFinales = {
                ...atributos,
                PLAGAS: valorCheck(atributos.requiere_plagas),
                ASBELTO_CUBIERTA: valorCheck(atributos.requiere_asbesto_cubierta),
                ASBELTO_FACHADA: valorCheck(atributos.requiere_asbesto_fachada),
                ASBELTO_LOGGIA: valorCheck(atributos.requiere_asbesto_logia),
                ASBELTO_REDES: valorCheck(atributos.requiere_asbesto_redes),
                RIESGO_REDES: valorCheck(atributos.riesgo_redes_grave_deterioro),
                RIESGO_ESTRUCTURA: valorCheck(atributos.riesgo_estructura_grave_deterioro),
                RIESGO_ESCALERAS: valorCheck(atributos.riesgo_escaleras_grave_deterioro),
                RIESGO_TECHUMBRE: valorCheck(atributos.riesgo_techumbre_grave_deterioro),
                REGULACION: valorCheck(atributos.requiere_regularizacion),
                EFICIENCIA_ENERGETICA: valorCheck(atributos.eficiencia_energetica),
                ACONDICIONAMIENTO: valorCheck(atributos.acondicionamiento_termico),
                tabla_priorizada: atributos.tabla_priorizada || [], // Asegúrate que esta variable se calcule o venga del servicio
                imagen: { _type: "image", source: mapImageBlob, format: "image/png", width: 450, height: 300 },
                imagenes_adjuntas: imagenesWord
            };

            // 6. Procesar Word y Descargar
            status.textContent = "📝 Generando archivo Word final...";
            const templateResponse = await fetch("template.docx");
            if (!templateResponse.ok) throw new Error("No se encontró template.docx");
            const templateBlob = await templateResponse.blob();

            const handler = new TemplateHandler();
            const docGenerado = await handler.process(templateBlob, datosFinales);

            window.saveAs(docGenerado, `Reporte_DTC_OID_${oid}.docx`);

            status.innerHTML = "✅ ¡Documento generado con éxito!<br><small>El archivo se ha descargado automáticamente.</small>";
            document.getElementById("loader").style.display = "none";

        } catch (error) {
            console.error(error);
            status.innerHTML = "❌ Error: " + error.message;
            document.getElementById("loader").style.display = "none";
        }
    }

    ejecutar();
});
