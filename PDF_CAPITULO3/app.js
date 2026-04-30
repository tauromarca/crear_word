(function () {
    "use strict";

    // Hallazgo 3.1: Se asume que ArcGIS API se carga localmente o con integridad en el HTML
    require(["esri/identity/IdentityManager", "esri/request"], function(esriId, esriRequest) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

        // Hallazgo 2.1: Función para prevenir XSS
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        }

        // Lógica para ordenar la Tabla IV por puntaje
        function prepararTablaPriorizada(rawData) {
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.PUNTAJE_AREA_VERDE, intervencion: rawData.INTERVENCION_AREA_VERDE },
                { nombre: "B. Cierres Perimetrales", p: rawData.PUNTAJE_CIERRES, intervencion: rawData.INTERVENCION_CIERRES },
                { nombre: "C. Techumbre", p: rawData.PUNTAJE_TECHUMBRE, intervencion: rawData.INTERVENCION_TECHUMBRE },
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.PUNTAJE_ASCENSORES, intervencion: rawData.INTERVENCION_ASCENSORES },
                { nombre: "E. Fachadas y/o Muros", p: rawData.PUNTAJE_FACHADA, intervencion: rawData.INTERVENCION_FACHADA },
                { nombre: "F. Sistemas de Iluminación", p: rawData.PUNTAJE_ILUMINACION, intervencion: rawData.INTERVENCION_ILUMINACION },
                { nombre: "G. Redes de Servicio", p: rawData.PUNTAJE_REDES, intervencion: rawData.INTERVENCION_REDES },
                { nombre: "K. Accesibilidad Universal", p: rawData.PUNTAJE_ACCESIBILIDAD, intervencion: rawData.INTERVENCION_ACCESIBILIDAD }
            ];
            // Ordenar descendente
            partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
            // Formatear decimales para el Word
            return partidas.map(item => ({
                nombre: item.nombre,
                p: !isNaN(item.p) ? parseFloat(item.p).toFixed(4) : "0.0000",
                intervencion: sanitize(item.intervencion)
            }));
        }

        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid");

            if (!oid) {
                status.textContent = "Error: ID no recibido.";
                return;
            }

            try {
                status.textContent = "🔐 Validando identidad institucional...";

                // Consulta segura a ArcGIS con Identity Manager
                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: {
                        objectIds: oid, // CORREGIDO: Usar 'oid' definido arriba
                        outFields: "*",
                        f: "json"
                    },
                    responseType: "json"
                });

                if (!response.data.features.length) throw new Error("Registro no encontrado.");
                
                const rawData = response.data.features[0].attributes;

                // Hallazgo 2.2: Limpiar URL inmediatamente para proteger privacidad
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                // --- PROCESAMIENTO DE DATOS ---
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    // Formatear fechas
                    if (typeof val === 'number' && val > 1000000000000) {
                        val = new Date(val).toLocaleDateString("es-CL");
                    }
                    // Hallazgo 2.1: Sanitizar todos los campos
                    attr[key] = sanitize(val);
                });

                // Lógica de Checkboxes Si/No
                const incrementos = ["PLAGAS", "ASBELTO_CUBIERTA", "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES", "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION", "EFICIENCIA_ENERGETICA", "ACONDICIONAMIENTO"];
                incrementos.forEach(campo => {
                    attr[campo] = (rawData[campo] && String(rawData[campo]).toLowerCase() === "sí") ? "☑" : "☐";
                });

                // Generar lista para Tabla IV
                attr.tabla_priorizada = prepararTablaPriorizada(rawData);

                // --- GENERACIÓN DOCX ---
                status.textContent = "📝 Generando documento oficial...";
                
                const templateResp = await fetch(PLANTILLA_URL);
                if (!templateResp.ok) throw new Error("No se pudo cargar la plantilla.");
                
                const content = await templateResp.arrayBuffer();
                const zip = new window.PizZip(content);
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    paragraphLoop: true, 
                    linebreaks: true 
                });

                doc.setData(attr);
                doc.render();

                const docxBlob = doc.getZip().generate({ type: "blob" });
                // Hallazgo 2.3: Nombre de archivo controlado
                const safeName = `Ficha_DTC_${oid}.docx`;
                window.saveAs(docxBlob, safeName);
                
                status.innerHTML = `<div style="color: green;">✔ Generado con éxito.</div>
                                    <p style="font-size:0.8em;">Use Microsoft 365 para exportar a PDF.</p>`;

            } catch (error) {
                console.error("Error de acceso:", error);
                status.textContent = "❌ Error: " + error.message;
            }
        }

        // Ejecutar proceso
        generar();
    });
})();