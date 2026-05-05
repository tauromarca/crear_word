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
const PLANTILLA_URL = "https://tauromarca.github.io/crear_word/PDF_CAPITULO3/PLANTILLA%20VISUALIZACI%C3%93N%20DTC.docx";
const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ";

const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
esriId.registerOAuthInfos([authInfo]);

// ============================================================
// GENERAR IMAGEN DEL MAPA
// ============================================================
async function generarMapaComoImagen(featureGeometry) {

    return new Promise((resolve, reject) => {

        try {

            const geometry = {
                type: "polygon",
                rings: featureGeometry.rings,
                spatialReference: featureGeometry.spatialReference || { wkid: 4326 }
            };

            const container = document.createElement("div");
            container.style.width = "1200px";
            container.style.height = "900px";
            container.style.position = "absolute";
            container.style.top = "-9999px";
            document.body.appendChild(container);

            const map = new Map({ basemap: "streets-vector" });

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
                        outline: { color: [0, 197, 255, 1], width: 2 }
                    }
                });

                view.graphics.add(graphic);

                await view.goTo({ target: geometry, padding: 50 });

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

                    console.log("📸 Tamaño imagen:", bytes.length);

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
// MODULO IMAGEN WORD (FINAL FUNCIONAL)
// ============================================================
function MyImageModule(options) {
    this.options = options || {};
}

MyImageModule.prototype.optionsTransformer = function (options, doc) {
    this.doc = doc;
    return options;
};

MyImageModule.prototype.parse = function (type, data) {
    if (type === "tag" && data.tag.charAt(0) === "%") {
        return { type: "placeholder", value: data.tag.substr(1) };
    }
    return null;
};

MyImageModule.prototype.render = function (part, options) {

    if (part.type !== "placeholder") return null;

    const tagValue = options.scopeManager.getValue(part.value);

    if (!(tagValue instanceof Uint8Array)) {
        console.warn("Imagen inválida:", tagValue);
        return { value: "" };
    }

    const imgName = "image_" + Date.now() + ".png";
    const rId = "rId" + Date.now();

    this.doc.zip.file("word/media/" + imgName, tagValue);

    const relsPath = "word/_rels/document.xml.rels";
    let rels = this.doc.zip.file(relsPath).asText();

    rels = rels.replace(
        "</Relationships>",
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`
    );

    this.doc.zip.file(relsPath, rels);

    const cx = 550 * 9525;
    const cy = 420 * 9525;

    return {
        value: `
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="1" name="Mapa"/>

        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">

            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="Imagen"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>

              <pic:blipFill>
                <a:blip r:embed="${rId}"
                        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>

              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${cx}" cy="${cy}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>

            </pic:pic>

          </a:graphicData>
        </a:graphic>

      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
`
    };
};

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

        status.textContent = "🗺️ Generando mapa...";

        const mapaBuffer = await generarMapaComoImagen(feature.geometry);

        if (!mapaBuffer || mapaBuffer.length === 0) {
            throw new Error("Imagen no generada");
        }

        const attr = {};
        Object.keys(feature.attributes).forEach(k => {
            attr[k] = feature.attributes[k];
            attr[k.toUpperCase()] = feature.attributes[k];
        });

        attr["MAPA_POLIGONO"] = new Uint8Array(mapaBuffer);

        status.textContent = "📝 Generando Word...";

        const templateResp = await fetch(PLANTILLA_URL);

        const doc = new window.docxtemplater(
            new window.PizZip(await templateResp.arrayBuffer()),
            {
                delimiters: { start: "[[", end: "]]" },
                modules: [new MyImageModule()]
            }
        );

        doc.setData(attr);
        doc.render();

        window.saveAs(
            doc.getZip().generate({ type: "blob" }),
            `Reporte_DTC_${oid}.docx`
        );

        status.textContent = "✅ Documento generado correctamente";

    } catch (error) {
        console.error(error);
        status.textContent = "❌ " + error;
    }
}

generar();

});
})();