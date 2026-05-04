(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";
        const CONVERT_API_SECRET = "TU_SECRET_CONVERTAPI"; // <--- CAMBIAR
        const APP_ID_ARCGIS = "TU_APP_ID";               // <--- CAMBIAR

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // Módulo de imagen v4
        function MyImageModule(options) { this.options = options || {}; }
        MyImageModule.prototype.optionsTransformer = function(options, docxtemplater) { this.docxtemplater = docxtemplater; return options; };
        MyImageModule.prototype.parse = function(type, data) {
            if (type === "tag" && data.tag.charAt(0) === "%") return { type: "placeholder", value: data.tag.substr(1) };
            return null;
        };
        MyImageModule.prototype.render = function(part, options) {
            if (part.type !== "placeholder") return null;
            const tagValue = options.scopeManager.getValue(part.value);
            if (!tagValue || typeof tagValue === 'string') return { value: "" };
            const numId = Math.floor(Math.random() * 1e6);
            const rId = "rIdImg" + numId;
            const imgName = "img_" + numId + ".png";
            const size = this.options.getSize(null, tagValue, part.value);
            this.docxtemplater.zip.file("word/media/" + imgName, tagValue, { binary: true });
            const relsPath = "word/_rels/document.xml.rels";
            let rels = this.docxtemplater.zip.file(relsPath).asText();
            rels = rels.replace("</Relationships>", `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
            this.docxtemplater.zip.file(relsPath, rels);
            const cx = Math.round(size[0] * 9525), cy = Math.round(size[1] * 9525);
            return { value: `<w:run><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${numId}" name="Img"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${numId}" name="Pic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:run>` };
        };

        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5);
                const mapServerUrl = FEATURE_LAYER_URL.replace("FeatureServer", "MapServer");
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");
                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: JSON.stringify(ext.spatialReference),
                        layers: "show:0",
                        layerDefs: JSON.stringify({"0": `objectid=${oid}`}),
                        size: "1000,750", format: "png32", f: "image", token: credential.token
                    },
                    responseType: "array-buffer"
                });
                return new Uint8Array(response.data);
            } catch (e) { return null; }
        }

        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            // Protección contra elementos null (Hallazgo 2.1)
            if (loader) loader.style.display = "block";
            if (status) status.textContent = "🔐 Validando acceso...";

            if (!oid) {
                if (status) status.textContent = "Error: ID no encontrado.";
                if (loader) loader.style.display = "none";
                return;
            }

            try {
                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, { query: { objectIds: oid, outFields: "*", returnGeometry: true, f: "json" }, responseType: "json" })
                ]);

                const rawData = response.data.features[0].attributes;
                const geometry = response.data.features[0].geometry;

                // 1. Imagen del Mapa
                let mapaBuffer = await obtenerImagenMapa(oid, geometry);

                // 2. Traducción de Dominios
                const domainMap = {};
                serviceMeta.data.fields.forEach(f => {
                    if (f.domain?.codedValues) {
                        domainMap[f.name] = {};
                        f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                    }
                });

                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    attr[key.toUpperCase()] = val;
                });

                // 3. Mapa y Checks
                if (mapaBuffer) attr["MAPA_POLIGONO"] = mapaBuffer;
                const mapaChecks = {"PLAGAS": "requiere_plagas", "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta", "ASBELTO_FACHADA": "requiere_asbesto_fachada", "ASBELTO_LOGGIA": "requiere_asbesto_logia", "ASBELTO_REDES": "requiere_asbesto_redes", "RIESGO_REDES": "riesgo_redes_grave_deterioro", "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro", "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro", "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro", "REGULACION": "requiere_regularizacion"};
                Object.keys(mapaChecks).forEach(tag => {
                    const val = String(rawData[mapaChecks[tag]] || "").toLowerCase();
                    attr[tag] = (val.includes("si") || val.includes("sí")) ? "☑" : "☐";
                });

                // 4. Word
                if (status) status.textContent = "📝 Generando reporte...";
                const template = await fetch(PLANTILLA_URL).then(r => r.arrayBuffer());
                const doc = new window.docxtemplater(new window.PizZip(template), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({ getSize: (i, v, n) => n === "MAPA_POLIGONO" ? [550, 420] : [300, 200] })]
                });
                doc.setData(attr);
                doc.render();

                const docxBlob = doc.getZip().generate({ type: "blob" });
                
                // 5. PDF
                if (status) status.textContent = "🚀 Convirtiendo a PDF...";
                const conv = window.ConvertApi.auth({ secret: CONVERT_API_SECRET });
                const params = conv.createParams();
                params.add('File', docxBlob, `Reporte_${oid}.docx`);
                const result = await conv.convert('docx', 'pdf', params);
                const pdfBlob = await fetch(result.files[0].Url).then(r => r.blob());

                window.saveAs(pdfBlob, `Ficha_Priorizacion_${oid}.pdf`);
                if (status) status.textContent = "✅ ¡Listo!";
                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                if (status) status.textContent = "❌ Error: " + error.message;
                if (loader) loader.style.display = "none";
            }
        }

        generar();
    });
})();