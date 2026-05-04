(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        // ============================================================
        // CONFIGURACIÓN
        // ============================================================
        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";
        const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // 1. MÓDULO DE IMAGEN v4
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

        function getVal(obj, fieldName) {
            if (!obj) return "";
            const key = Object.keys(obj).find(k => k.toLowerCase() === fieldName.toLowerCase());
            return key ? obj[key] : "";
        }

        // ============================================================
        // 2. EXPORTACIÓN DE MAPA (CORRECCIÓN ERROR 400)
        // ============================================================
        async function obtenerYDescargarMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5);
                const mapServerUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0] + "/MapServer";
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const queryParams = {
                    bbox: ext.xmin + "," + ext.ymin + "," + ext.xmax + "," + ext.ymax,
                    bboxSR: ext.spatialReference.wkid || 102100,
                    imageSR: ext.spatialReference.wkid || 102100,
                    layers: "show:0",
                    layerDefs: JSON.stringify({ "0": "objectid = " + oid }),
                    size: "1000,750",
                    format: "png32",
                    transparent: "true",
                    f: "image",
                    token: credential.token
                };

                const response = await esriRequest(mapServerUrl + "/export", {
                    query: queryParams,
                    responseType: "array-buffer"
                });

                const uint8Array = new Uint8Array(response.data);
                
                // --- ACCIÓN: DESCARGAR PNG USANDO window.saveAs ---
                const imageBlob = new Blob([uint8Array], { type: "image/png" });
                window.saveAs(imageBlob, `Mapa_Poligono_${oid}.png`);
                
                return uint8Array;
            } catch (e) { 
                console.error("❌ Error exportando mapa:", e); 
                return null; 
            }
        }

        function prepararTablaPriorizada(rawData, domainMap) {
            const getLabel = (f, v) => (domainMap[f] && domainMap[f][v] !== undefined) ? domainMap[f][v] : v;
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: getVal(rawData, "a_ponderado"), intervencion: getLabel("tipo_intervencion", getVal(rawData, "tipo_intervencion")) },
                { nombre: "B. Cierres Perimetrales", p: getVal(rawData, "b_ponderado"), intervencion: getLabel("tipo_intervencion_perimetrales", getVal(rawData, "tipo_intervencion_perimetrales")) },
                { nombre: "C. Techumbre", p: getVal(rawData, "c_ponderado"), intervencion: getLabel("tipo_intervencion_techumbre", getVal(rawData, "tipo_intervencion_techumbre")) },
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: getVal(rawData, "d_ponderado"), intervencion: getLabel("tipo_intervencion_ascensores", getVal(rawData, "tipo_intervencion_ascensores")) },
                { nombre: "E. Fachadas y/o Muros", p: getVal(rawData, "e_ponderado"), intervencion: getLabel("tipo_intervencion_fachada", getVal(rawData, "tipo_intervencion_fachada")) },
                { nombre: "F. Sistemas de Iluminación", p: getVal(rawData, "f_ponderado"), intervencion: getLabel("tipo_intervencion_iluminaria", getVal(rawData, "tipo_intervencion_iluminaria")) },
                { nombre: "G. Redes de Servicio", p: getVal(rawData, "g_ponderado"), intervencion: getLabel("Tipo_Intervencion_Redes_servicios", getVal(rawData, "Tipo_Intervencion_Redes_servicios")) },
                { nombre: "K. Accesibilidad Universal", p: getVal(rawData, "k_ponderado"), intervencion: "No aplica" }
            ];
            partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
            return partidas.map(item => ({
                nombre: item.nombre, p: !isNaN(parseFloat(item.p)) ? parseFloat(item.p).toFixed(4) : "0.0000", intervencion: (item.intervencion || "")
            }));
        }

        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) return;
            if (loader) loader.style.display = "block";

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

                // 1. Obtener y Descargar Mapa PNG
                let mapaBuffer = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Bajando imagen del mapa...";
                    mapaBuffer = await obtenerYDescargarMapa(oid, feature.geometry);
                }

                // 2. Procesar Dominios y Atributos
                const domainMap = {};
                serviceMeta.data.fields.forEach(f => {
                    if (f.domain?.codedValues) {
                        domainMap[f.name] = {};
                        f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                    }
                });

                if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    attr[key.toLowerCase()] = (val === null || val === undefined) ? "" : val;
                    attr[key.toUpperCase()] = attr[key.toLowerCase()];
                });

                if (mapaBuffer) attr["MAPA_POLIGONO"] = mapaBuffer;

                // 3. Lógica de Checks ☑
                const mapaChecks = { "PLAGAS": "requiere_plagas", "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta", "ASBELTO_FACHADA": "requiere_asbesto_fachada", "ASBELTO_LOGGIA": "requiere_asbesto_logia", "ASBELTO_REDES": "requiere_asbesto_redes", "RIESGO_REDES": "riesgo_redes_grave_deterioro", "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro", "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro", "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro", "REGULACION": "requiere_regularizacion" , "EFICIENCIA_ENERGETICA": "eficiencia_energetica", "ACONDICIONAMIENTO": "acondicionamiento_termico"};
                Object.keys(mapaChecks).forEach(tag => {
                    const valorRaw = String(getVal(rawData, mapaChecks[tag])).toLowerCase();
                    attr[tag] = (valorRaw.includes("si") || valorRaw.includes("sí")) ? "☑" : "☐";
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

                // 4. GENERAR Y BAJAR WORD USANDO window.saveAs
                status.textContent = "📝 Generando reporte Word...";
                const templateResp = await fetch(PLANTILLA_URL);
                const doc = new window.docxtemplater(new window.PizZip(await templateResp.arrayBuffer()), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName.toUpperCase() === "MAPA_POLIGONO" ? [550, 420] : [300, 200]
                    })],
                    nullGetter: () => ""
                });

                doc.setData(attr);
                doc.render();

                // Esperamos un instante antes de bajar el segundo archivo para evitar bloqueos del navegador
                setTimeout(() => {
                    window.saveAs(doc.getZip().generate({ type: "blob" }), `Reporte_DTC_${oid}.docx`);
                    status.textContent = "✅ ¡Archivos generados con éxito!";
                    if (loader) loader.style.display = "none";
                }, 1000);

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
                if (loader) loader.style.display = "none";
            }
        }

        generar();
    });
})();