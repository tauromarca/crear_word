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
        
        const CONVERT_API_SECRET = "TU_SECRET_REAL"; 
        const APP_ID_ARCGIS = "TU_APP_ID_REAL"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // ============================================================
        // 1. MÓDULO DE IMAGEN MEJORADO
        // ============================================================
        function MyImageModule(options) { this.options = options || {}; }
        MyImageModule.prototype.optionsTransformer = function(options, doc) { this.doc = doc; return options; };
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
            const imgName = "mapa_" + numId + ".png";
            const size = this.options.getSize(null, tagValue, part.value);

            this.doc.zip.file("word/media/" + imgName, tagValue, { binary: true });
            const relsPath = "word/_rels/document.xml.rels";
            let rels = this.doc.zip.file(relsPath).asText();
            rels = rels.replace("</Relationships>", `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
            this.doc.zip.file(relsPath, rels);

            const cx = Math.round(size[0] * 9525), cy = Math.round(size[1] * 9525);
            return { value: `<w:run><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${numId}" name="Img"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${numId}" name="Pic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:run>` };
        };

        // ============================================================
        // 2. EXPORTACIÓN DE MAPA (FIJANDO ERROR 400)
        // ============================================================
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5);
                const mapServerUrl = FEATURE_LAYER_URL.replace("FeatureServer/0", "MapServer");
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: ext.spatialReference.wkid || 102100,
                        layers: "show:0",
                        // Sintaxis específica para Hosted Services:
                        layerDefs: `0:objectid=${oid}`, 
                        size: "1000,800",
                        format: "png32",
                        transparent: "true",
                        f: "image",
                        token: credential.token
                    },
                    responseType: "array-buffer"
                });

                const uint8Array = new Uint8Array(response.data);
                
                // Descarga PNG por separado
                const blob = new Blob([uint8Array], { type: "image/png" });
                window.saveAs(blob, `Mapa_Copropiedad_${oid}.png`);
                
                return uint8Array;
            } catch (e) { 
                console.error("❌ Error exportando mapa:", e); 
                return null; 
            }
        }

        // ============================================================
        // 3. GENERACIÓN Y MAPEADO DE DATOS
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) { status.textContent = "Error: Falta ID."; return; }
            if (loader) loader.style.display = "block";

            try {
                status.textContent = "📡 Consultando ArcGIS...";

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

                // 1. Obtener Mapa
                let mapaGis = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando mapa...";
                    mapaGis = await obtenerImagenMapa(oid, feature.geometry);
                }

                // 2. Procesar Dominios
                const domainMap = {};
                serviceMeta.data.fields.forEach(f => {
                    if (f.domain?.codedValues) {
                        domainMap[f.name] = {};
                        f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                    }
                });

                // 3. MAPEADO CRÍTICO (Word usa minúsculas según tu foto)
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    
                    const finalVal = (val === null || val === undefined) ? "" : val;
                    // Guardamos el valor en minúscula para coincidir con [[copropiedad_formalizada]]
                    attr[key.toLowerCase()] = finalVal;
                    attr[key] = finalVal;
                });

                // Inyectar Mapa
                if (mapaGis) attr["mapa_poligono"] = mapaGis;

                // 4. Lógica de Checks (Mapeamos a minúsculas)
                const mapaChecks = { "plagas": "requiere_plagas", "asbelto_cubierta": "requiere_asbesto_cubierta", "asbelto_fachada": "requiere_asbesto_fachada", "asbelto_loggia": "requiere_asbesto_logia", "asbelto_redes": "requiere_asbesto_redes", "riesgo_redes": "riesgo_redes_grave_deterioro", "riesgo_estructura": "riesgo_estructura_grave_deterioro", "riesgo_escaleras": "riesgo_escaleras_grave_deterioro", "riesgo_techumbre": "riesgo_techumbre_grave_deterioro", "regulacion": "requiere_regularizacion" };
                
                Object.keys(mapaChecks).forEach(tagWord => {
                    const campoArcGIS = mapaChecks[tagWord];
                    const valorRaw = String(rawData[campoArcGIS] || "").toLowerCase();
                    const esSi = valorRaw.includes("si") || valorRaw.includes("sí");
                    attr[tagWord] = esSi ? "☑" : "☐";
                });

                // 5. WORD
                status.textContent = "📝 Generando reporte Word...";
                const template = await fetch(PLANTILLA_URL).then(r => r.arrayBuffer());
                const doc = new window.docxtemplater(new window.PizZip(template), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName.toLowerCase() === "mapa_poligono" ? [550, 420] : [300, 200]
                    })],
                    nullGetter: () => ""
                });

                console.log("DATOS ENVIADOS AL WORD:", attr); // VERIFICA ESTO EN F12

                doc.setData(attr);
                doc.render();

                window.saveAs(doc.getZip().generate({ type: "blob" }), `Ficha_Copropiedad_${oid}.docx`);
                
                status.textContent = "✅ ¡Listo!";
                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
                if (loader) loader.style.display = "none";
            }
        }
        generar();
    });
})();