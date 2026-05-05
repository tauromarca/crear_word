(function () {
"use strict";

require([
    "esri/request",
    "esri/identity/IdentityManager",
    "esri/identity/OAuthInfo",
    "esri/Map",
    "esri/views/MapView",
    "esri/Graphic"
], function(esriRequest, esriId, OAuthInfo, Map, MapView, Graphic) {

const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";
const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ";

const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
esriId.registerOAuthInfos([authInfo]);

// ============================================================
// 🔥 GENERAR MAPA COMO IMAGEN (ROBUSTO)
// ============================================================
async function generarMapaComoImagen(featureGeometry) {

    return new Promise((resolve, reject) => {

        try {

            if (!featureGeometry || !featureGeometry.rings) {
                return reject("Geometría inválida");
            }

            // ✔ geometría autocasteable segura
            const geometry = {
                type: "polygon",
                rings: featureGeometry.rings,
                spatialReference: featureGeometry.spatialReference || { wkid: 4326 }
            };

            // contenedor oculto
            const container = document.createElement("div");
            container.style.width = "1200px";
            container.style.height = "900px";
            container.style.position = "absolute";
            container.style.top = "-9999px";
            document.body.appendChild(container);

            const map = new Map({
                basemap: "streets-vector"
            });

            const view = new MapView({
                container: container,
                map: map,
                ui: { components: [] }
            });

            view.when(async () => {

                const graphic = new Graphic({
                    geometry: geometry,
                    symbol: {
                        type: "simple-fill",
                        color: [0, 197, 255, 0.3],
                        outline: {
                            color: [0, 197, 255, 1],
                            width: 2
                        }
                    }
                });

                view.graphics.add(graphic);

                // ✔ centrado robusto
                await view.goTo({
                    target: geometry,
                    padding: 50
                });

                // ✔ esperar render (estable)
                setTimeout(async () => {

                    const screenshot = await view.takeScreenshot({
                        format: "png",
                        width: 1200,
                        height: 900
                    });

                    const base64 = screenshot.dataUrl.split(",")[1];
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);

                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }

                    view.destroy();
                    container.remove();

                    resolve(bytes);

                }, 1200);

            });

        } catch (e) {
            reject(e);
        }

    });
}

// ============================================================
// MODULO IMAGEN WORD
// ============================================================
function MyImageModule(options) { this.options = options || {}; }

MyImageModule.prototype.optionsTransformer = function(options, doc) {
    this.doc = doc;
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

    if (!tagValue || typeof tagValue === 'string') {
        return { value: "" };
    }

    const numId = Math.floor(Math.random() * 1e6);
    const rId = "rIdImg" + numId;
    const imgName = "mapa_" + numId + ".png";

    const size = this.options.getSize(null, tagValue, part.value);

    this.doc.zip.file("word/media/" + imgName, tagValue, { binary: true });

    const relsPath = "word/_rels/document.xml.rels";
    let rels = this.doc.zip.file(relsPath).asText();

    rels = rels.replace("</Relationships>",
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`
    );

    this.doc.zip.file(relsPath, rels);

    const cx = Math.round(size[0] * 9525);
    const cy = Math.round(size[1] * 9525);

    return {
        value: `<w:run><w:drawing><wp:inline>
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${numId}" name="Mapa"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:blipFill>
        <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
        </pic:blipFill>
        </pic:pic>
        </a:graphicData>
        </a:graphic>
        </wp:inline></w:drawing></w:run>`
    };
}

// ============================================================
// MAIN
// ============================================================
async function generar() {

    const status = document.getElementById("status");
    const oid = new URLSearchParams(window.location.search).get("objectid");

    if (!oid) {
        status.textContent = "❌ Falta objectid";
        return;
    }

    try {

        status.textContent = "🔐 Conectando...";
        await esriId.getCredential("https://www.arcgis.com/sharing");

        status.textContent = "📡 Consultando datos...";

        const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
            query: {
                objectIds: oid,
                outFields: "*",
                returnGeometry: true,
                f: "json"
            },
            responseType: "json"
        });

        const feature = response.data.features[0];

        if (!feature.geometry) {
            throw "No existe geometría";
        }

        status.textContent = "🗺️ Generando mapa...";

        const mapaBuffer = await generarMapaComoImagen(feature.geometry);

        const attr = {};
        Object.keys(feature.attributes).forEach(k => {
            attr[k] = feature.attributes[k];
            attr[k.toUpperCase()] = feature.attributes[k];
        });

        attr["MAPA_POLIGONO"] = mapaBuffer;

        status.textContent = "📝 Generando Word...";

        const templateResp = await fetch(PLANTILLA_URL);

        const doc = new window.docxtemplater(
            new window.PizZip(await templateResp.arrayBuffer()),
            {
                delimiters: { start: "[[", end: "]]" },
                modules: [new MyImageModule({
                    getSize: () => [550, 420]
                })]
            }
        );

        doc.setData(attr);
        doc.render();

        window.saveAs(
            doc.getZip().generate({ type: "blob" }),
            `Reporte_DTC_${oid}.docx`
        );

        status.textContent = "✅ Completado";

    } catch (error) {
        console.error(error);
        status.textContent = "❌ " + error;
    }
}

generar();

});
})();