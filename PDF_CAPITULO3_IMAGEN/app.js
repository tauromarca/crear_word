//import { TemplateHandler } from "https://cdn.jsdelivr.net/npm/easy-template-x@7.2.4/+esm";
import { TemplateHandler } from "./libs/easy-template-x.js";
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

    // Hallazgo 2.1: Sanitización de datos
    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
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
            //status.textContent = "📸 Procesando adjuntos...";
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
            //status.textContent = "🗺️ Generando vista de mapa...";
            const view = new MapView({
                container: "map-view",
                map: new Map({ basemap: "hybrid" }),
                ui: { components: [] }
            });
            view.graphics.add(new Graphic({
                geometry: feature.geometry,
                symbol: { type: "simple-fill", color: [255, 0, 0, 0.2], outline: { color: [255, 0, 0], width: 2 } }
            }));
            await view.when();
            await view.goTo(feature.geometry.extent.expand(2.2));
            
            // Esperar renderizado
            await new Promise(r => setTimeout(r, 2500));
            const screenshot = await view.takeScreenshot({ format: "png" });
            const mapBlob = await fetch(screenshot.dataUrl).then(r => r.blob());

            // 5. Lógica de Negocio (Checks y Tabla IV)
            const check = (v) => String(v || "").toLowerCase().includes("si") ? "☑" : "☐";
            
            // ORDENAMIENTO DE TABLA IV - Coincidiendo con los tags del Word
            const tabla = [
                { nombre: "A. Áreas Verdes", p: parseFloat(raw.a_ponderado || 0), intervencion: raw.tipo_intervencion || "" },
                { nombre: "B. Cierres Perimetrales", p: parseFloat(raw.b_ponderado || 0), intervencion: raw.tipo_intervencion_perimetrales || "" },
                { nombre: "C. Techumbre", p: parseFloat(raw.c_ponderado || 0), intervencion: raw.tipo_intervencion_techumbre || "" },
                {
                  nombre: "d. Obras en Ascensores, Escaleras y/o Circulaciones",
                  p: parseFloat(raw.d_ponderado || 0),
                  intervencion:
                    raw.tipo_intervencion_ascensores
                      ? raw.tipo_intervencion_ascensores
                      : (raw.tipo_intervencion_escaleras || "")
                    },
                { nombre: "E. Fachadas y/o Muros", p: parseFloat(raw.e_ponderado || 0), intervencion: raw.tipo_intervencion_fachada || "" },
                { nombre: "F. Sistemas de Iluminación", p: parseFloat(raw.f_ponderado || 0), intervencion: raw.tipo_intervencion_iluminaria || "" },
                { nombre: "G. Redes de Servicio", p: parseFloat(raw.g_ponderado || 0), intervencion: raw.Tipo_Intervencion_Redes_servicios || "" },
                { nombre: "K. Accesibilidad Universal", p: parseFloat(raw.k_ponderado || 0), intervencion: "No aplica" }
            ]
            .sort((a, b) => b.p - a.p) // Ordenar de mayor a menor
            .map(i => ({ 
                nombre: i.nombre, 
                p: i.p.toFixed(4), 
                intervencion: sanitize(i.intervencion) // Usamos 'intervencion' sin acento para evitar errores de código
            }));

            // Objeto final para el template
            const datosFinales = {};
            Object.keys(raw).forEach(k => {
                let val = raw[k];
                if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                datosFinales[k] = sanitize(val);
            });

            // Hallazgo 2.2: Limpiar URL para privacidad
            if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

            // Inyectar lógicas específicas
            Object.assign(datosFinales, {
                PLAGAS: check(raw.requiere_plagas),
                ASBELTO_CUBIERTA: check(raw.requiere_asbesto_cubierta),
                ASBELTO_FACHADA: check(raw.requiere_asbesto_fachada),
                ASBELTO_LOGGIA: check(raw.requiere_asbesto_logia),
                ASBELTO_REDES: check(raw.requiere_asbesto_redes),
                RIESGO_REDES: check(raw.riesgo_redes_grave_deterioro),
                RIESGO_ESTRUCTURA: check(raw.riesgo_estructura_grave_deterioro),
                RIESGO_ESCALERAS: check(raw.riesgo_escaleras_grave_deterioro),
                RIESGO_TECHUMBRE: check(raw.riesgo_techumbre_grave_deterioro),
                EFICIENCIA_ENERGETICA: check(raw.eficiencia_energetica),
                REGULACION: check(raw.requiere_regularizacion),
                ACONDICIONAMIENTO: check(raw.acondicionamiento_termico),
                tabla_priorizada: tabla,
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
