(function () {
    "use strict";

    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo"
    ], function (Map, MapView, FeatureLayer, esriId, OAuthInfo) {

        const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const APP_ID = "V3aGw0JQVKFM6BdJ";

        let view;

        const authInfo = new OAuthInfo({
            appId: APP_ID,
            popup: false
        });

        esriId.registerOAuthInfos([authInfo]);

        async function ejecutar() {

            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const btn = document.getElementById("btn-download");
            const previewImg = document.getElementById("final-preview");
            const mapViewDiv = document.getElementById("map-view");

            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) {
                status.textContent = "❌ Error: Falta parámetro objectid";
                return;
            }

            loader.style.display = "block";

            try {
                status.textContent = "🔐 Autenticando...";

                await esriId.getCredential("https://www.arcgis.com/sharing");

                status.textContent = "🗺️ Cargando capa Survey123...";

                const layer = new FeatureLayer({
                    url: FS_URL,
                    definitionExpression: `objectid = ${oid}`,
                    renderer: {
                        type: "simple",
                        symbol: {
                            type: "simple-fill",
                            color: [255, 0, 0, 0.25],
                            outline: { color: [255, 0, 0, 1], width: 2 }
                        }
                    }
                });

                const map = new Map({
                    basemap: "gray-vector",
                    layers: [layer]
                });

                view = new MapView({
                    container: "map-view",
                    map: map,
                    ui: { components: [] }
                });

                await view.when();

                const query = layer.createQuery();
                query.where = `objectid = ${oid}`;
                query.returnGeometry = true;

                const result = await layer.queryFeatures(query);

                if (!result.features.length) {
                    throw new Error("No se encontró el polígono");
                }

                const feature = result.features[0];

                status.textContent = "📍 Ajustando vista...";

                await view.goTo({
                    target: feature.geometry.extent,
                    padding: { top: 40, bottom: 40, left: 40, right: 40 }
                });

                // 🔥 CLAVE: esperar render real
                await view.when();

                // Esperar que el mapa deje de actualizarse
                await view.when(() => !view.updating);

               

                status.textContent = "📸 Generando imagen PNG...";

                const screenshot = await view.takeScreenshot({
                    format: "png",
                    quality: 100,
                    width: 1920,
                    height: 1080
                });

                // Mostrar imagen
                previewImg.src = screenshot.dataUrl;
                previewImg.style.display = "block";

                // Ocultar mapa
                mapViewDiv.style.display = "none";

                // Botón descarga
                btn.style.display = "inline-block";
                btn.onclick = () => {
                    const a = document.createElement("a");
                    a.href = screenshot.dataUrl;
                    a.download = `Poligono_${oid}.png`;
                    a.click();
                };

                loader.style.display = "none";
                status.textContent = "✅ Imagen lista para descargar";

            } catch (error) {
                console.error(error);
                loader.style.display = "none";
                status.textContent = "❌ Error: " + error.message;
            }
        }

        ejecutar();
    });
})();