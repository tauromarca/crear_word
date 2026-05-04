(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        // ============================================================
        // CONFIGURACIÓN CENTRALIZADA
        // ============================================================
        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";
        
        // REEMPLAZAR CON TUS CREDENCIALES REALES
        const CONVERT_API_SECRET = "TU_SECRET_CONVERTAPI"; 
        const APP_ID_ARCGIS = "TU_APP_ID_OAUTH2"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // ============================================================
        // 1. MÓDULO DE IMAGEN PARA DOCXTEMPLATER (v4)
        // ============================================================
        function MyImageModule(options) { this.options = options || {}; }
        MyImageModule.prototype.optionsTransformer = function(options, docxtemplater) {
            this.docxtemplater = docxtemplater;
            return options;
        };
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
            const imgName = "img_arcgis_" + numId + ".png";
            const size = this.options.getSize(null, tagValue, part.value);

            this.docxtemplater.zip.file("word/media/" + imgName, tagValue, { binary: true });

            const relsPath = "word/_rels/document.xml.rels";
            let relsContent = this.docxtemplater.zip.file(relsPath).asText();
            relsContent = relsContent.replace("</Relationships>", `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
            this.docxtemplater.zip.file(relsPath, relsContent);

            const cx = Math.round(size[0] * 9525), cy = Math.round(size[1] * 9525);
            return { value: `<w:run><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${numId}" name="Img"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${numId}" name="Pic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:run>` };
        };

        // ============================================================
        // 2. EXPORTACIÓN DE MAPA (PNG) Y DESCARGA
        // ============================================================
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5); // Margen del mapa
                
                const mapServerUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0] + "/MapServer";
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: JSON.stringify(ext.spatialReference),
                        layers: "show:0",
                        layerDefs: JSON.stringify({"0": `objectid = ${oid}`}), // Corrección Error 400
                        size: "1200,900",
                        format: "png32",
                        transparent: "true",
                        f: "image",
                        token: credential.token
                    },
                    responseType: "array-buffer"
                });

                const uint8Array = new Uint8Array(response.data);

                // ACCIÓN: BAJAR PNG POR SEPARADO
                const imageBlob = new Blob([uint8Array], { type: "image/png" });
                window.saveAs(imageBlob, `Plano_Poligono_ID_${oid}.png`);

                return uint8Array;
            } catch (e) {
                console.error("❌ Error exportando mapa:", e);
                return null;
            }
        }

        // ============================================================
        // 3. UTILIDADES Y PROCESAMIENTO
        // ============================================================
        function sanitize(str) {
            if (str === null || str === undefined) return "";
            const temp = document.createElement('div');
            temp.textContent = str;
            return temp.innerHTML;
        }

        function prepararTablaPriorizada(rawData, domainMap) {
            const getLabel = (field, val) => (domainMap[field] && domainMap[field][val] !== undefined) ? domainMap[field][val] : val;
            let partidas = [
                { nombre: "A. Áreas Verdes y Equipamiento", p: rawData.a_ponderado, int: getLabel("tipo_intervencion", rawData.tipo_intervencion) },
                { nombre: "B. Cierres Perimetrales", p: rawData.b_ponderado, int: getLabel("tipo_intervencion_perimetrales", rawData.tipo_intervencion_perimetrales) },
                { nombre: "C. Techumbre", p: rawData.c_ponderado, int: getLabel("tipo_intervencion_techumbre", rawData.tipo_intervencion_techumbre) },
                { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: rawData.d_ponderado, int: getLabel("tipo_intervencion_ascensores", rawData.tipo_intervencion_ascensores) },
                { nombre: "E. Fachadas y/o Muros", p: rawData.e_ponderado, int: getLabel("tipo_intervencion_fachada", rawData.tipo_intervencion_fachada) },
                { nombre: "F. Sistemas de Iluminación", p: rawData.f_ponderado, int: getLabel("tipo_intervencion_iluminaria", rawData.tipo_intervencion_iluminaria) },
                { nombre: "G. Redes de Servicio", p: rawData.g_ponderado, int: getLabel("Tipo_Intervencion_Redes_servicios", rawData.Tipo_Intervencion_Redes_servicios) },
                { nombre: "K. Accesibilidad Universal", p: rawData.k_ponderado, int: "No aplica" }
            ];
            partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
            return partidas.map(item => ({
                nombre: item.nombre,
                p: !isNaN(item.p) ? parseFloat(item.p).toFixed(4) : "0.0000",
                int: sanitize(item.int)
            }));
        }

        // ============================================================
        // 4. PROCESO DE GENERACIÓN
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) { status.textContent = "Error: ID no detectado."; return; }
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

                // 1. Obtener Mapa y Bajarlo como PNG
                let mapaBuffer = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando y descargando mapa...";
                    mapaBuffer = await obtenerImagenMapa(oid, feature.geometry);
                }

                // 2. Procesar Dominios
                const domainMap = {};
                if (serviceMeta.data.fields) {
                    serviceMeta.data.fields.forEach(f => {
                        if (f.domain?.codedValues) {
                            domainMap[f.name] = {};
                            f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                        }
                    });
                }

                // Hallazgo 2.2: Limpieza de URL
                if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

                // 3. Mapeo de Atributos
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    const sVal = sanitize(val);
                    attr[key] = sVal;
                    attr[key.toUpperCase()] = sVal;
                });

                // Inyectar Mapa en Word
                if (mapaBuffer) attr["MAPA_POLIGONO"] = mapaBuffer;

                // 4. Lógica de Checks ☑
                const mapaChecks = { "PLAGAS": "requiere_plagas", "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta", "ASBELTO_FACHADA": "requiere_asbesto_fachada", "ASBELTO_LOGGIA": "requiere_asbesto_logia", "ASBELTO_REDES": "requiere_asbesto_redes", "RIESGO_REDES": "riesgo_redes_grave_deterioro", "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro", "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro", "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro", "REGULACION": "requiere_regularizacion" };
                Object.keys(mapaChecks).forEach(tag => {
                    const valorRaw = String(rawData[mapaChecks[tag]] || "").toLowerCase();
                    attr[tag] = (valorRaw.includes("si") || valorRaw.includes("sí")) ? "☑" : "☐";
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

                // 5. RENDERIZADO WORD
                status.textContent = "📝 Generando reporte Word...";
                const templateResp = await fetch(PLANTILLA_URL);
                const doc = new window.docxtemplater(new window.PizZip(await templateResp.arrayBuffer()), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName === "MAPA_POLIGONO" ? [550, 420] : [300, 200]
                    })],
                    nullGetter: () => ""
                });

                doc.setData(attr);
                doc.render();

                // 6. PDF AUTOMÁTICO
                status.textContent = "🚀 Convirtiendo a PDF oficial...";
                const docxBlob = doc.getZip().generate({ type: "blob" });
                const fileName = `Reporte_DTC_${oid}`;
                
                const conv = window.ConvertApi.auth({ secret: CONVERT_API_SECRET });
                const params = conv.createParams();
                params.add('File', docxBlob, `${fileName}.docx`);
                const result = await conv.convert('docx', 'pdf', params);
                
                const pdfBlob = await fetch(result.files[0].Url).then(r => r.blob());
                window.saveAs(pdfBlob, `${fileName}.pdf`);
                
                status.innerHTML = `<div style="color: #27ae60; font-weight: bold;">✔ Proceso completado exitosamente.</div>`;
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