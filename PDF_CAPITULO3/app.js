(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, Polygon) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

        // ============================================================
        // 1. DEFINICIÓN DEL MÓDULO DE IMAGEN (Integrado para evitar TypeError)
        // ============================================================
        function MyImageModule(options) {
            this.options = options || {};
        }
        MyImageModule.prototype.optionsTransformer = function(options, docxtemplater) {
            this.docxtemplater = docxtemplater;
            return options;
        };
        MyImageModule.prototype.parse = function(type, data) {
            if (type === "tag" && data.tag.charAt(0) === "%") {
                return { type: "placeholder", value: data.tag.substr(1) };
            }
            return null;
        };
        MyImageModule.prototype.render = function(part, options) {
            if (part.type !== "placeholder") return null;
            const tagValue = options.scopeManager.getValue(part.value);
            if (!tagValue) return { value: "" };

            const numId = Math.floor(Math.random() * 1000000);
            const rId = "rIdImg" + numId;
            const imgName = "img_arcgis_" + numId + ".png";
            const size = this.options.getSize(null, tagValue, part.value);

            // Inyección binaria en el ZIP
            this.docxtemplater.zip.file("word/media/" + imgName, tagValue, { binary: true });

            // Actualizar relaciones XML
            const relsPath = "word/_rels/document.xml.rels";
            let relsContent = this.docxtemplater.zip.file(relsPath).asText();
            const relXml = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>`;
            relsContent = relsContent.replace("</Relationships>", relXml + "</Relationships>");
            this.docxtemplater.zip.file(relsPath, relsContent);

            // XML DrawingML para Word
            const cx = Math.round(size[0] * 9525);
            const cy = Math.round(size[1] * 9525);
            const xml = `<w:run><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${numId}" name="Img"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${numId}" name="Pic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:run>`;
            return { value: xml };
        };

        // ============================================================
        // 2. FUNCIÓN DE EXPORTACIÓN DEL MAPA
        // ============================================================
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(1.8); // Margen para ver calles aledañas
                const mapServerUrl = FEATURE_LAYER_URL.replace("FeatureServer", "MapServer");
                
                // Obtener token activo de la sesión de Experience Builder
                const credential = await esriId.checkSignInStatus("https://www.arcgis.com/sharing");
                const token = credential ? credential.token : "";

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: ext.spatialReference.wkid || 102100,
                        layers: "show:0",
                        layerDefs: `{"0":"objectid=${oid}"}`, // Sintaxis JSON estricta
                        size: "800,600",
                        format: "png32",
                        transparent: "true",
                        f: "image",
                        token: token
                    },
                    responseType: "array-buffer"
                });
                return new Uint8Array(response.data);
            } catch (e) {
                console.error("Error en exportación de mapa:", e);
                return null;
            }
        }

        // ============================================================
        // 3. PROCESO DE GENERACIÓN
        // ============================================================
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        }

        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) { status.textContent = "Error: ID no detectado."; return; }

            try {
                status.textContent = "🔐 Accediendo a datos institucionales...";

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

                // Generar Mapa
                let mapaGis = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando plano de copropiedad...";
                    mapaGis = await obtenerImagenMapa(oid, feature.geometry);
                }

                // Mapa de Dominios
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
                    
                    const sVal = sanitize(val);
                    attr[key] = sVal;
                    attr[key.toUpperCase()] = sVal;
                });

                // Inyectar el Mapa en los datos
                if (mapaGis) {
                    attr["MAPA_POLIGONO"] = mapaGis;
                }

                // Lógica de Checks Sí/No
                const checks = ["PLAGAS", "ASBELTO_CUBIERTA", "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES", "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION","EFICIENCIA_ENERGETICA","ACONDICIONAMIENTO"];
                checks.forEach(tag => {
                    const v = String(attr[tag] || "").toLowerCase();
                    attr[tag] = (v.includes("si") || v.includes("sí")) ? "☑" : "☐";
                });

                // Generar Word
                status.textContent = "📝 Generando documento oficial...";
                const templateResp = await fetch(PLANTILLA_URL);
                const zip = new window.PizZip(await templateResp.arrayBuffer());
                
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName === "MAPA_POLIGONO" ? [550, 400] : [300, 200]
                    })]
                });

                doc.setData(attr);
                doc.render();

                window.saveAs(doc.getZip().generate({ type: "blob" }), `Ficha_DTC_${oid}.docx`);
                status.innerHTML = `<div style="color: #27ae60;">✔ Proceso finalizado.</div>`;

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
            }
        }
        generar();
    });
})();