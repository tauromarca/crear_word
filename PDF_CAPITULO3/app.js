(function () {
    "use strict";

    // Hallazgo 3.1 y 4.1: Cargamos los módulos de ArcGIS
    // Ponemos esri/request al principio para evitar errores de asignación
    require([
        "esri/request",
        "esri/identity/IdentityManager"
    ], function(esriRequest, esriId) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

        // Hallazgo 2.1: Sanitización XSS
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        }

        // Función para ordenar la Tabla IV por puntaje descendente
        function prepararTablaPriorizada(rawData) {
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.a_ponderado, intervencion: rawData.tipo_intervencion },
                { nombre: "B. Cierres Perimetrales", p: rawData.b_ponderado, intervencion: rawData.tipo_intervencion_perimetrales },
                { nombre: "C. Techumbre", p: rawData.c_ponderado, intervencion: rawData.tipo_intervencion_techumbre},
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.d_ponderado, intervencion: rawData.tipo_intervencion_ascensores},
                { nombre: "E. Fachadas y/o Muros", p: rawData.e_ponderado, intervencion: rawData.tipo_intervencion_fachadas },
                { nombre: "F. Sistemas de Iluminación", p: rawData.f_ponderado, intervencion: rawData.tipo_intervencion_iluminacion},
                { nombre: "G. Redes de Servicio", p: rawData.g_ponderado, intervencion: rawData.tipo_intervencion_redes},
                { nombre: "K. Accesibilidad Universal", p: rawData.k_ponderado, intervencion: rawData.tipo_intervencion_accesibilidad }
            ];
            partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
            return partidas.map(item => ({
                nombre: item.nombre,
                p: !isNaN(item.p) ? parseFloat(item.p).toFixed(4) : "0.0000",
                intervencion: sanitize(item.intervencion)
            }));
        }

        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            
            // Detección flexible de ID
            const oid = urlParams.get("objectid") || urlParams.get("oid") || urlParams.get("objectIds");

            if (!oid) {
                status.textContent = "Error: ID de registro no detectado.";
                return;
            }

            try {
                // Verificación de seguridad: ¿esriRequest es realmente una función?
                if (typeof esriRequest !== "function") {
                    throw new Error("Error crítico: El motor de peticiones de ArcGIS no cargó correctamente.");
                }

                status.textContent = "🔐 Validando identidad institucional...";

                // Consulta segura usando el motor oficial de ArcGIS
                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: {
                        objectIds: oid,
                        outFields: "*",
                        f: "json"
                    },
                    responseType: "json"
                });

                if (!response.data.features || response.data.features.length === 0) {
                    throw new Error("El registro no existe o su sesión institucional expiró.");
                }
                
                const rawData = response.data.features[0].attributes;

                // Hallazgo 2.2: Limpiar URL para proteger la privacidad (Ley 19.628)
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (typeof val === 'number' && val > 1000000000000) {
                        val = new Date(val).toLocaleDateString("es-CL");
                    }
                    attr[key] = sanitize(val);
                });

                // Lógica de Checkboxes Unicode
                const incrementos = ["requiere_plagas", "requiere_asbesto_cubierta", "requiere_asbesto_fachada", "requiere_asbesto_logia", "requiere_asbesto_redes", "riesgo_redes_grave_deterioro", "riesgo_estructura_grave_deterioro", "riesgo_escaleras_grave_deterioro", "riesgo_techumbre_grave_deterioro", "requiere_regularizacion", "eficiencia_energetica", "acondicionamiento_termico"];
                incrementos.forEach(campo => {
                    const val = String(rawData[campo] || "").toLowerCase();
                    attr[campo] = (val === "sí" || val === "si") ? "☑" : "☐";
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData);

                status.textContent = "📝 Generando reporte...";
                
                const templateResp = await fetch(PLANTILLA_URL);
                if (!templateResp.ok) throw new Error("Plantilla no encontrada.");
                
                const content = await templateResp.arrayBuffer();
                const zip = new window.PizZip(content);
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    paragraphLoop: true, linebreaks: true 
                });

                doc.setData(attr);
                doc.render();

                const docxBlob = doc.getZip().generate({ type: "blob" });
                window.saveAs(docxBlob, `Ficha_DTC_${oid}.docx`);
                
                status.innerHTML = `<div style="color: #27ae60; font-weight: bold;">✔ Reporte generado.</div>
                                    <p style="font-size:0.8em; color: #666;">Use Office 365 para exportar a PDF.</p>`;

            } catch (error) {
                console.error("Error en flujo seguro:", error);
                status.textContent = "❌ " + error.message;
            }
        }

        // Ejecutar proceso
        generar();
    });
})();