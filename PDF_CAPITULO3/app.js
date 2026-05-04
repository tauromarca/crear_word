(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/geometry/Polygon" // 1. Nuevo módulo para manejar el polígono
    ], function(esriRequest, esriId, Polygon) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        }

        // --- FUNCIÓN PARA GENERAR LA IMAGEN DEL MAPA ---
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(1.5); // Margen del 50% alrededor
                const mapServerUrl = FEATURE_LAYER_URL.replace("FeatureServer", "MapServer");
                
                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: ext.spatialReference.wkid || 102100,
                        layers: "show:0",
                        layerDefs: JSON.stringify({ "0": `objectid = ${oid}` }),
                        size: "800,600",
                        format: "png32",
                        f: "image"
                    },
                    responseType: "array-buffer"
                });
                return new Uint8Array(response.data);
            } catch (e) {
                console.error("No se pudo generar la imagen del mapa", e);
                return null;
            }
        }

        function prepararTablaPriorizada(rawData, domainMap) {
            const getLabel = (field, val) => (domainMap[field] && domainMap[field][val] !== undefined) ? domainMap[field][val] : val;
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.a_ponderado, intervencion: getLabel("tipo_intervencion", rawData.tipo_intervencion) },
                { nombre: "B. Cierres Perimetrales", p: rawData.b_ponderado, intervencion: getLabel("tipo_intervencion_perimetrales", rawData.tipo_intervencion_perimetrales) },
                { nombre: "C. Techumbre", p: rawData.c_ponderado, intervencion: getLabel("tipo_intervencion_techumbre", rawData.tipo_intervencion_techumbre)},
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.d_ponderado, intervencion: getLabel("tipo_intervencion_ascensores", rawData.tipo_intervencion_ascensores)},
                { nombre: "E. Fachadas y/o Muros", p: rawData.e_ponderado, intervencion: getLabel("tipo_intervencion_fachada", rawData.tipo_intervencion_fachada) },
                { nombre: "F. Sistemas de Iluminación", p: rawData.f_ponderado, intervencion: getLabel("tipo_intervencion_iluminaria", rawData.tipo_intervencion_iluminaria)},
                { nombre: "G. Redes de Servicio", p: rawData.g_ponderado, intervencion: getLabel("Tipo_Intervencion_Redes_servicios", rawData.Tipo_Intervencion_Redes_servicios)},
                { nombre: "K. Accesibilidad Universal", p: rawData.k_ponderado, intervencion: "No aplica" }
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

            if (!oid) { status.textContent = "Error: ID no detectado."; return; }

            try {
                status.textContent = "🔐 Validando identidad institucional...";

                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, {
                        query: { 
                            objectIds: oid, 
                            outFields: "*", 
                            returnGeometry: true, // 2. Cambio mínimo: pedir geometría
                            f: "json" 
                        },
                        responseType: "json"
                    })
                ]);

                if (!response.data.features.length) throw new Error("Registro no encontrado.");
                
                const feature = response.data.features[0];
                const rawData = feature.attributes;

                // 3. Generar la imagen del mapa si existe geometría
                let mapaGis = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando imagen del polígono...";
                    mapaGis = await obtenerImagenMapa(oid, feature.geometry);
                }

                const domainMap = {};
                if (serviceMeta.data.fields) {
                    serviceMeta.data.fields.forEach(f => {
                        if (f.domain && f.domain.codedValues) {
                            domainMap[f.name] = {};
                            f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                        }
                    });
                }

                if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1000000000000) val = new Date(val).toLocaleDateString("es-CL");
                    attr[key] = sanitize(val);
                    attr[key.toUpperCase()] = sanitize(val); 
                });

                // Insertar el mapa en los datos
                if (mapaGis) attr["MAPA_POLIGONO"] = mapaGis;

                const mapaWordArcgis = {
                    "PLAGAS": "requiere_plagas",
                    "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta",
                    "ASBELTO_FACHADA": "requiere_asbesto_fachada",
                    "ASBELTO_LOGGIA": "requiere_asbesto_logia",
                    "ASBELTO_REDES": "requiere_asbesto_redes",
                    "RIESGO_REDES": "riesgo_redes_grave_deterioro",
                    "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro",
                    "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro",
                    "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro",
                    "REGULACION": "requiere_regularizacion",
                    "EFICIENCIA_ENERGETICA": "eficiencia_energetica",
                    "ACONDICIONAMIENTO": "acondicionamiento_termico"
                };

                Object.keys(mapaWordArcgis).forEach(tagWord => {
                    const campoArcGIS = mapaWordArcgis[tagWord];
                    const valorRaw = String(rawData[campoArcGIS] || "").toLowerCase();
                    const esSi = valorRaw.includes("si") || valorRaw.includes("sí");
                    attr[tagWord] = esSi ? "☑" : "☐";
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

                status.textContent = "📝 Generando reporte...";
                const templateResp = await fetch(PLANTILLA_URL);
                const zip = new window.PizZip(await templateResp.arrayBuffer());
                
                // Configurar el módulo de imagen
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new window.CustomImageModule({
                        getSize: (img, tagValue, tagName) => {
                            if (tagName === "MAPA_POLIGONO") return [550, 400]; // Tamaño grande para el mapa
                            return [300, 200];
                        }
                    })]
                });

                doc.setData(attr);
                doc.render();

                const docxBlob = doc.getZip().generate({ type: "blob" });
                window.saveAs(docxBlob, `Ficha_DTC_${oid}.docx`);
                status.innerHTML = `<div style="color: #27ae60; font-weight: bold;">✔ Reporte generado.</div>`;

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
            }
        }
        generar();
    });
})();