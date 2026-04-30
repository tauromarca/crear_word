(function () {
    "use strict";

    // Hallazgo 3.1: Carga de módulos de ArcGIS Identity
    require(["esri/identity/IdentityManager", "esri/request"], function(esriId, esriRequest) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

        // Hallazgo 2.1: Sanitización para evitar XSS (Prevención de inyección de código)
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str; // Escapa caracteres peligrosos
            return temp.innerHTML;
        }

        // Función para ordenar la Tabla IV por puntaje descendente
        function prepararTablaPriorizada(rawData) {
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.a_obtenido, intervencion: rawData.a_mostrar_ponderado },
                { nombre: "B. Cierres Perimetrales", p: rawData.b_obtenido, intervencion: rawData.b_mostrar_ponderado },
                { nombre: "C. Techumbre", p: rawData.c_obtenido, intervencion: rawData.c_mostrar_ponderado },
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.d_obtenido, intervencion: rawData.d_mostrar_ponderado },
                { nombre: "E. Fachadas y/o Muros", p: rawData.e_obtenido, intervencion: rawData.e_mostrar_ponderado },
                { nombre: "F. Sistemas de Iluminación", p: rawData.f_obtenido, intervencion: rawData.f_mostrar_ponderado },
                { nombre: "G. Redes de Servicio", p: rawData.g_obtenido, intervencion: rawData.g_mostrar_ponderado },
                { nombre: "K. Accesibilidad Universal", p: rawData.k_obtenido, intervencion: rawData.k_mostrar_ponderado }
            ];
            // Ordenar de mayor a menor
            partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
            // Formatear decimales y sanitizar
            return partidas.map(item => ({
                nombre: item.nombre,
                p: !isNaN(item.p) ? parseFloat(item.p).toFixed(4) : "0.0000",
                intervencion: sanitize(item.intervencion)
            }));
        }

        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            
            // CAPTURA FLEXIBLE DEL ID (Resuelve el error de 'undefined')
            const oid = urlParams.get("objectid") || urlParams.get("oid") || urlParams.get("objectIds");

            if (!oid) {
                status.textContent = "Error: No se recibió el ID del registro en la URL.";
                return;
            }

            try {
                status.textContent = "🔐 Validando identidad institucional...";

                // Consulta segura a ArcGIS usando el Identity Manager (Hallazgo 4.2)
                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: {
                        objectIds: oid, // Usamos la variable 'oid' definida arriba
                        outFields: "*",
                        f: "json"
                    },
                    responseType: "json"
                });

                if (!response.data.features || response.data.features.length === 0) {
                    throw new Error("El registro no existe o su sesión no tiene permisos.");
                }
                
                const rawData = response.data.features[0].attributes;

                // Hallazgo 2.2: Limpieza de URL inmediata para proteger privacidad
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                // --- PROCESAMIENTO DE DATOS ---
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    // Formatear fechas de ArcGIS (números largos)
                    if (typeof val === 'number' && val > 1000000000000) {
                        val = new Date(val).toLocaleDateString("es-CL");
                    }
                    // Hallazgo 2.1: Sanitizar campos
                    attr[key] = sanitize(val);
                });

                // Lógica de Checkboxes Si/No (Unicode ☑ / ☐)
                const incrementos = ["PLAGAS", "ASBELTO_CUBIERTA", "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES", "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION", "EFICIENCIA_ENERGETICA", "ACONDICIONAMIENTO"];
                incrementos.forEach(campo => {
                    const valorOriginal = String(rawData[campo] || "").toLowerCase();
                    attr[campo] = (valorOriginal === "sí" || valorOriginal === "si") ? "☑" : "☐";
                });

                // Generar tabla priorizada para la Sección IV
                attr.tabla_priorizada = prepararTablaPriorizada(rawData);

                // --- GENERACIÓN DEL DOCUMENTO WORD ---
                status.textContent = "📝 Generando reporte oficial...";
                
                const templateResp = await fetch(PLANTILLA_URL);
                if (!templateResp.ok) throw new Error("No se pudo cargar la plantilla .docx");
                
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
                
                // Hallazgo 2.3: Nombre de archivo sin caracteres peligrosos
                const safeName = `Reporte_DTC_${oid}.docx`;
                window.saveAs(docxBlob, safeName);
                
                status.innerHTML = `<div style="color: #27ae60; font-weight: bold;">✔ Documento generado con éxito.</div>
                                    <p style="font-size:0.85em; color: #666;">Utilice Microsoft 365 para exportar a PDF.</p>`;

            } catch (error) {
                console.error("Brecha de proceso segura:", error);
                status.textContent = "❌ Error: " + error.message;
            }
        }

        // Ejecución automática al cargar los módulos
        generar();
    });
})();