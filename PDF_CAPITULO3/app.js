(function () {
    "use strict";

    // Hallazgo 3.1 y 4.1: Cargamos los módulos de ArcGIS
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
        function prepararTablaPriorizada(rawData, domainMap) {
            // Función auxiliar para obtener etiqueta de dominio si existe
            const getLabel = (field, val) => (domainMap[field] && domainMap[field][val] !== undefined) ? domainMap[field][val] : val;

            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.a_ponderado, intervencion: getLabel("tipo_intervencion", rawData.tipo_intervencion) },
                { nombre: "B. Cierres Perimetrales", p: rawData.b_ponderado, intervencion: getLabel("tipo_intervencion_perimetrales", rawData.tipo_intervencion_perimetrales) },
                { nombre: "C. Techumbre", p: rawData.c_ponderado, intervencion: getLabel("tipo_intervencion_techumbre", rawData.tipo_intervencion_techumbre)},
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.d_ponderado, intervencion: getLabel("tipo_intervencion_escaleras", rawData.tipo_intervencion_escaleras)},
                { nombre: "E. Fachadas y/o Muros", p: rawData.e_ponderado, intervencion: getLabel("tipo_intervencion_fachadas", rawData.tipo_intervencion_fachadas) },
                { nombre: "F. Sistemas de Iluminación", p: rawData.f_ponderado, intervencion: getLabel("tipo_intervencion_iluminaria", rawData.tipo_intervencion_iluminaria)},
                { nombre: "G. Redes de Servicio", p: rawData.g_ponderado, intervencion: getLabel("Tipo_Intervencion_Redes_servicios", rawData.Tipo_Intervencion_Redes_servicios)},
                { nombre: "K. Accesibilidad Universal", p: rawData.k_ponderado, intervencion: getLabel("deterioro_accesos_pm_reducida", rawData.deterioro_accesos_pm_reducida) }
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
            
            const oid = urlParams.get("objectid") || urlParams.get("oid") || urlParams.get("objectIds");

            if (!oid) {
                status.textContent = "Error: ID de registro no detectado.";
                return;
            }

            try {
                if (typeof esriRequest !== "function") {
                    throw new Error("Error crítico: El motor de peticiones de ArcGIS no cargó correctamente.");
                }

                status.textContent = "🔐 Validando identidad institucional...";

                // 1. Obtener metadatos del servicio y datos del registro en paralelo
                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, {
                        query: { objectIds: oid, outFields: "*", f: "json" },
                        responseType: "json"
                    })
                ]);

                if (!response.data.features || response.data.features.length === 0) {
                    throw new Error("El registro no existe o su sesión institucional expiró.");
                }
                
                const rawData = response.data.features[0].attributes;

                // 2. Crear mapa de dominios (códigos a etiquetas)
                const domainMap = {};
                if (serviceMeta.data.fields) {
                    serviceMeta.data.fields.forEach(f => {
                        if (f.domain && f.domain.codedValues) {
                            domainMap[f.name] = {};
                            f.domain.codedValues.forEach(cv => {
                                domainMap[f.name][cv.code] = cv.name;
                            });
                        }
                    });
                }

                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    
                    // Traducir código a etiqueta si existe dominio
                    if (domainMap[key] && domainMap[key][val] !== undefined) {
                        val = domainMap[key][val];
                    }

                    if (typeof val === 'number' && val > 1000000000000) {
                        val = new Date(val).toLocaleDateString("es-CL");
                    }
                    attr[key] = sanitize(val);
                });

                const incrementos = ["requiere_plagas", "requiere_asbesto_cubierta", "requiere_asbesto_fachada", "requiere_asbesto_logia", "requiere_asbesto_redes", "riesgo_redes_grave_deterioro", "riesgo_estructura_grave_deterioro", "riesgo_escaleras_grave_deterioro", "riesgo_techumbre_grave_deterioro", "requiere_regularizacion", "eficiencia_energetica", "acondicionamiento_termico"];
                incrementos.forEach(campo => {
                    const val = String(attr[campo] || "").toLowerCase(); // Usamos attr porque ya está traducido
                    attr[campo] = (val === "sí" || val === "si") ? "☑" : "☐";
                });

                // Pasamos domainMap a la función de la tabla para traducir las intervenciones
                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

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

        generar();
    });
})();