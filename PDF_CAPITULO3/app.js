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
        
        const CONVERT_API_SECRET = "TU_SECRET_REAL"; 
        const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // ============================================================
        // 1. MÓDULO DE IMAGEN INTEGRADO (v4)
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
            const imgName = "mapa_gis_" + numId + ".png";
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
        // 2. EXPORTACIÓN DE MAPA (PNG)
        // ============================================================
        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.8);
                const mapServerUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0] + "/MapServer";
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: {
                        bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                        bboxSR: ext.spatialReference.wkid || 102100,
                        layers: "show:0",
                        layerDefs: JSON.stringify({"0": `objectid = ${oid}`}),
                        size: "1200,900", format: "png32", transparent: "true", f: "image",
                        token: credential.token
                    },
                    responseType: "array-buffer"
                });

                const uint8Array = new Uint8Array(response.data);
                // Bajar PNG por separado con un pequeño delay para evitar bloqueo del navegador
                setTimeout(() => {
                    window.saveAs(new Blob([uint8Array], { type: "image/png" }), `Mapa_Poligono_${oid}.png`);
                }, 500);
                
                return uint8Array;
            } catch (e) { console.error("Error exportando mapa:", e); return null; }
        }

        function prepararTablaPriorizada(rawData, domainMap) {
            const getLabel = (f, v) => (domainMap[f] && domainMap[f][v] !== undefined) ? domainMap[f][v] : v;
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
                nombre: item.nombre, p: !isNaN(item.p) ? parseFloat(item.p).toFixed(4) : "0.0000", int: (item.int === null || item.int === undefined) ? "" : item.int
            }));
        }

        // ============================================================
        // 3. PROCESO DE GENERACIÓN
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) { status.textContent = "ID no detectado."; return; }
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

                // 1. Mapa
                let mapaBuffer = null;
                if (feature.geometry) {
                    status.textContent = "🗺️ Generando mapa...";
                    mapaBuffer = await obtenerImagenMapa(oid, feature.geometry);
                }

                // 2. Dominios
                const domainMap = {};
                serviceMeta.data.fields.forEach(f => {
                    if (f.domain?.codedValues) {
                        domainMap[f.name] = {};
                        f.domain.codedValues.forEach(cv => domainMap[f.name][cv.code] = cv.name);
                    }
                });

                if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);

                // 3. Atributos (MAPEADOS A MINÚSCULAS Y MAYÚSCULAS PARA EL WORD)
                const attr = {};
                Object.keys(rawData).forEach(key => {
                    let val = rawData[key];
                    if (domainMap[key] && domainMap[key][val] !== undefined) val = domainMap[key][val];
                    if (typeof val === 'number' && val > 1e12) val = new Date(val).toLocaleDateString("es-CL");
                    
                    const finalVal = (val === null || val === undefined) ? "" : val;
                    attr[key] = finalVal; // Para tags [[nombre_conjunto]]
                    attr[key.toUpperCase()] = finalVal; // Para tags [[NOMBRE_CONJUNTO]]
                });

                if (mapaBuffer) {
                    attr["MAPA_POLIGONO"] = mapaBuffer;
                    attr["mapa_poligono"] = mapaBuffer;
                }

                // 4. Lógica de Checks ☑
                const mapaChecks = { "PLAGAS": "requiere_plagas", "ASBELTO_CUBIERTA": "requiere_asbesto_cubierta", "ASBELTO_FACHADA": "requiere_asbesto_fachada", "ASBELTO_LOGGIA": "requiere_asbesto_logia", "ASBELTO_REDES": "requiere_asbesto_redes", "RIESGO_REDES": "riesgo_redes_grave_deterioro", "RIESGO_ESTRUCTURA": "riesgo_estructura_grave_deterioro", "RIESGO_ESCALERAS": "riesgo_escaleras_grave_deterioro", "RIESGO_TECHUMBRE": "riesgo_techumbre_grave_deterioro", "REGULACION": "requiere_regularizacion" };
                Object.keys(mapaChecks).forEach(tag => {
                    const valorArcGIS = String(rawData[mapaChecks[tag]] || "").toLowerCase();
                    const check = (valorArcGIS.includes("si") || valorArcGIS.includes("sí")) ? "☑" : "☐";
                    attr[tag] = check;
                    attr[tag.toLowerCase()] = check;
                });

                attr.tabla_priorizada = prepararTablaPriorizada(rawData, domainMap);

                // 5. WORD
                status.textContent = "📝 Generando reporte oficial...";
                const template = await fetch(PLANTILLA_URL).then(r => r.arrayBuffer());
                const doc = new window.docxtemplater(new window.PizZip(template), {
                    delimiters: { start: "[[", end: "]]" },
                    modules: [new MyImageModule({
                        getSize: (img, val, tagName) => tagName.toUpperCase() === "MAPA_POLIGONO" ? [550, 420] : [300, 200]
                    })],
                    nullGetter: () => ""
                });

                doc.setData(attr);
                doc.render();

                const out = doc.getZip().generate({ type: "blob" });
                window.saveAs(out, `Ficha_Copropiedad_${oid}.docx`);
                
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