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
        const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // ============================================================
        // 1. MÓDULO DE IMAGEN v4
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
        // 2. UTILIDADES DE BÚSQUEDA (Evita campos en blanco)
        // ============================================================
        function getVal(obj, fieldName) {
            if (!obj) return "";
            const key = Object.keys(obj).find(k => k.toLowerCase() === fieldName.toLowerCase());
            return key ? obj[key] : "";
        }

        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5);
                const mapServerUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0] + "/MapServer";
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: ext.spatialReference.wkid || 102100,
                        layers: "show:0",
                        layerDefs: `{"0":"objectid=${oid}"}`, 
                        size: "1000,800", format: "png32", transparent: "true", f: "image",
                        token: credential.token
                    },
                    responseType: "array-buffer"
                });

                const uint8Array = new Uint8Array(response.data);
                
                // Forzar descarga PNG
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([uint8Array], { type: "image/png" }));
                link.download = `Mapa_Copropiedad_${oid}.png`;
                link.click();
                
                return uint8Array;
            } catch (e) { console.error("❌ Error exportando mapa:", e); return null; }
        }
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
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

        // ============================================================
        // 3. GENERACIÓN
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) return;
            if (loader) loader.style.display = "block";

            try {
                const [serviceMeta, response] = await Promise.all([
                    esriRequest(FEATURE_LAYER_URL, { query: { f: "json" }, responseType: "json" }),
                    esriRequest(`${FEATURE_LAYER_URL}/query`, { query: { objectIds: oid, outFields: "*", returnGeometry: true, f: "json" }, responseType: "json" })
                ]);

                const feature = response.data.features[0];
                const rawData = feature.attributes;

                // 1. Mapa
                let mapaBuffer = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando mapa...";
                    mapaBuffer = await obtenerImagenMapa(oid, feature.geometry);
                }

                // 2. Diccionario de Dominios
                const domainMap = {};
                serviceMeta.data.fields.forEach(f => {
                    if (f.domain?.codedValues) {
                        domainMap[f.name] = {};
                        f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                    }
                });

                // 3. Atributos para el Word
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    attr[key.toLowerCase()] = (val === null || val === undefined) ? "" : val;
                    attr[key.toUpperCase()] = attr[key.toLowerCase()];
                });

                if (mapaBuffer) {
                    attr["mapa_poligono"] = mapaBuffer;
                    attr["MAPA_POLIGONO"] = mapaBuffer;
                }

                // 4. Checks ☑
                const mapaChecks = { "PLAGAS": "requiere_plagas", "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta", "ASBELTO_FACHADA": "requiere_asbesto_fachada", "ASBELTO_LOGGIA": "requiere_asbesto_logia", "ASBELTO_REDES": "requiere_asbesto_redes", "RIESGO_REDES": "riesgo_redes_grave_deterioro", "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro", "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro", "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro", "REGULACION": "requiere_regularizacion", "EFICIENCIA_ENERGETICA": "eficiencia_energetica", "ACONDICIONAMIENTO": "acondicionamiento_termico" } ;
                
                Object.keys(mapaChecks).forEach(tag => {
                    const valArcGIS = String(getVal(rawData, mapaChecks[tag])).toLowerCase();
                    const check = (valArcGIS.includes("si") || valArcGIS.includes("sí")) ? "☑" : "☐";
                    attr[tag] = check;
                    attr[tag.toUpperCase()] = check;
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

                // 5. Word
                status.textContent = "📝 Generando reporte Word...";
                const template = await fetch(PLANTILLA_URL).then(r => r.arrayBuffer());
                const doc = new window.docxtemplater(new window.PizZip(template), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({ getSize: (i, v, n) => n.toUpperCase() === "MAPA_POLIGONO" ? [550, 420] : [300, 200] })],
                    nullGetter: () => ""
                });

                doc.setData(attr);
                doc.render();

                window.saveAs(doc.getZip().generate({ type: "blob" }), `Reporte_DTC_${oid}.docx`);
                
                status.textContent = "✅ ¡Proceso completado!";
                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                status.textContent = "❌ Error: " + error.message;
                if (loader) loader.style.display = "none";
            }
        }
        generar();
    });
})();