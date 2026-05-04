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
        const CONVERT_API_SECRET = "TU_SECRET_CONVERT_API"; // <--- CAMBIAR
        const APP_ID = "TU_ARCGIS_APP_ID";               // <--- CAMBIAR

        const authInfo = new OAuthInfo({ appId: APP_ID, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // --- LÓGICA DE IMAGEN ---
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

        async function generar() {
            // ELEMENTOS DEL DOM CON PROTECCIÓN
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            // --- SOLUCIÓN AL ERROR: Verificar si los elementos existen ---
            if (loader) loader.style.display = "block";
            if (status) status.textContent = "🔐 Validando identidad institucional...";

            if (!oid) {
                if (status) status.textContent = "❌ Error: ID no detectado en URL.";
                if (loader) loader.style.display = "none";
                return;
            }

            try {
                // Consultar ArcGIS
                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, { query: { objectIds: oid, outFields: "*", returnGeometry: true, f: "json" }, responseType: "json" })
                ]);

                if (!response.data.features.length) throw new Error("Registro no encontrado.");
                const rawData = response.data.features[0].attributes;

                // Hallazgo 2.2: Limpieza de URL
                if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

                const attr = {};
                Object.keys(rawData).forEach(k => {
                    let v = rawData[k];
                    if (typeof v === 'number' && v > 1e12) v = new Date(v).toLocaleDateString("es-CL");
                    attr[k.toUpperCase()] = v;
                });

                // Lógica de Checks y Word
                if (status) status.textContent = "📝 Generando reporte Word...";
                const template = await fetch(PLANTILLA_URL).then(r => r.arrayBuffer());
                const doc = new window.docxtemplater(new window.PizZip(template), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({ getSize: () => [300, 200] })]
                });
                doc.setData(attr);
                doc.render();

                // Conversión a PDF
                if (status) status.textContent = "🚀 Convirtiendo a PDF oficial...";
                const docxBlob = doc.getZip().generate({ type: "blob" });
                const conv = window.ConvertApi.auth({ secret: CONVERT_API_SECRET });
                const params = conv.createParams();
                params.add('File', docxBlob, `Ficha_${oid}.docx`);
                const result = await conv.convert('docx', 'pdf', params);
                const pdfBlob = await fetch(result.files[0].Url).then(r => r.blob());

                window.saveAs(pdfBlob, `Ficha_Priorizacion_${oid}.pdf`);
                if (status) status.textContent = "✅ ¡Proceso Exitoso!";
                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                if (status) status.textContent = "❌ Error: " + error.message;
                if (loader) loader.style.display = "none";
            }
        }

        // Ejecutar proceso
        generar();
    });
})();