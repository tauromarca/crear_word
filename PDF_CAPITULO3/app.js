// ... (mantenemos las importaciones require igual)

        // ============================================================
        // 2. FUNCIÓN DE EXPORTACIÓN DE MAPA (Sintaxis Hosted Service)
        // ============================================================
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5); // Ampliamos el área para que se vea el contexto
                
                // Convertimos FeatureServer a MapServer
                const mapServerUrl = FEATURE_LAYER_URL.replace("FeatureServer", "MapServer");
                
                // Obtenemos el token activo
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");
                
                // Parámetros específicos para ArcGIS Online Hosted Services
                const params = {
                    bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                    bboxSR: ext.spatialReference.wkid || 102100,
                    layers: "show:0",
                    layerDefs: `{"0":"objectid=${oid}"}`, // Sintaxis JSON estricta para Hosted Services
                    size: "1000,750",
                    format: "png32",
                    transparent: "true",
                    f: "image",
                    token: credential.token
                };

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: params,
                    responseType: "array-buffer"
                });

                console.log("🗺️ Mapa exportado correctamente");
                return new Uint8Array(response.data);
            } catch (e) {
                // Diagnóstico detallado del error de ArcGIS
                if (e.details && e.details.httpStatus) {
                    console.error("❌ Error de Servidor ArcGIS:", e.details.httpStatus, e.details.message);
                } else {
                    console.error("❌ Error desconocido en exportación:", e);
                }
                return null;
            }
        }

        // ============================================================
        // 3. PROCESO DE GENERACIÓN (v4)
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) return;

            try {
                status.textContent = "🔐 Accediendo a ArcGIS...";

                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, {
                        query: { objectIds: oid, outFields: "*", returnGeometry: true, f: "json" },
                        responseType: "json"
                    })
                ]);

                if (!response.data.features.length) throw new Error("Registro no encontrado.");
                
                const feature = response.data.features[0];
                const rawData = feature.attributes;

                // 1. Obtener imagen del mapa
                let mapaGis = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando mapa del polígono...";
                    mapaGis = await obtenerImagenMapa(oid, feature.geometry);
                }

                // 2. Procesar Atributos y Dominios
                const attr = {};
                const domainMap = {};
                if (serviceMeta.data.fields) {
                    serviceMeta.data.fields.forEach(f => {
                        if (f.domain?.codedValues) {
                            domainMap[f.name] = {};
                            f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                        }
                    });
                }

                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1000000000000) val = new Date(val).toLocaleDateString("es-CL");
                    attr[key.toUpperCase()] = (val === null || val === undefined) ? "" : val;
                });

                // Inyectar el Mapa (si se generó con éxito)
                if (mapaGis) {
                    attr["MAPA_POLIGONO"] = mapaGis;
                }

                // Lógica de Checks
                const checks = ["PLAGAS", "ASBELTO_CUBIERTA", "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES", "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION"];
                checks.forEach(tag => {
                    const v = String(attr[tag] || "").toLowerCase();
                    attr[tag] = (v.includes("si") || v.includes("sí")) ? "☑" : "☐";
                });

                // 3. GENERAR WORD (v4 Estricto)
                status.textContent = "📝 Generando reporte DTC...";
                const templateResp = await fetch(PLANTILLA_URL);
                const zip = new window.PizZip(await templateResp.arrayBuffer());
                
                // CONSTRUCTOR ÚNICO (Sin setOptions)
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName === "MAPA_POLIGONO" ? [550, 420] : [300, 200]
                    })],
                    nullGetter: () => "" 
                });

                doc.setData(attr);
                doc.render();

                window.saveAs(doc.getZip().generate({ type: "blob" }), `Ficha_DTC_${oid}.docx`);
                status.innerHTML = `<div style="color: #27ae60;">✔ Reporte generado correctamente.</div>`;

            } catch (error) {
                console.error("Error en flujo principal:", error);
                status.textContent = "❌ " + error.message;
            }
        }
        generar();
    });
})();