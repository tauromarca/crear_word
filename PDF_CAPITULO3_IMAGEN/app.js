(function () {
    "use strict";

    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo"
    ], function (Map, MapView, FeatureLayer, Graphic, esriId, OAuthInfo) {

        const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_b91310d4b733410381db831ffab56a68_form/FeatureServer/0";
        const APP_ID = "V3aGw0JQVKFM6BdJ";

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
                status.textContent = "❌ Falta objectid";
                return;
            }

            loader.style.display = "block";

            try {
                status.textContent = "🔐 Autenticando...";
                await esriId.getCredential("https://www.arcgis.com/sharing");

                // 🔹 MAPA SIN CAPA (IMPORTANTE)
                const map = new Map({
                  basemap: "hybrid"   // 👈 mejor opción general
                });
                const view = new MapView({
                    container: "map-view",
                    map: map,
                    ui: { components: [] }
                });

                await view.when();

                status.textContent = "📡 Consultando Survey123...";

                const layer = new FeatureLayer({
                    url: FS_URL
                });

                const query = layer.createQuery();
                query.where = `objectid = ${oid}`;
                query.returnGeometry = true;
                query.outFields = ["*"];

                const result = await layer.queryFeatures(query);

                if (!result.features.length) {
                    throw new Error("No se encontró polígono");
                }

                const feature = result.features[0];

                if (!feature.geometry) {
                    throw new Error("El registro no tiene geometría");
                }

                status.textContent = "🧩 Dibujando polígono...";

                // 🔥 DIBUJO MANUAL
                const graphic = new Graphic({
                    geometry: feature.geometry,
                    symbol: {
                        type: "simple-fill",
                        color: [255, 0, 0, 0.25],
                        outline: {
                            color: [255, 0, 0, 1],
                            width: 2
                        }
                    }
                });

                view.graphics.removeAll();
                view.graphics.add(graphic);

                // 🔹 Zoom al polígono
                await view.goTo({
                    target: graphic.geometry.extent,
                    padding: 40
                });

                // 🔹 Esperar render REAL
                await view.when();

                await new Promise(resolve => {
                    const handle = view.watch("updating", (val) => {
                        if (val === false) {
                            handle.remove();
                            resolve();
                        }
                    });
                });

                //await view.when(() => !view.updating);

                status.textContent = "📸 Generando PNG...";

                const screenshot = await view.takeScreenshot({
                    format: "png",
                    quality: 100,
                    width: 1920,
                    height: 1080
                });

                // Mostrar imagen
                previewImg.src = screenshot.dataUrl;
                previewImg.style.display = "block";

                mapViewDiv.style.display = "none";

                // Descargar
                btn.style.display = "inline-block";
                btn.onclick = () => {
                    const a = document.createElement("a");
                    a.href = screenshot.dataUrl;
                    a.download = `Poligono_${oid}.png`;
                    a.click();
                };

                loader.style.display = "none";
                status.textContent = "✅ Imagen lista";

            } catch (error) {
                console.error(error);
                loader.style.display = "none";
                status.textContent = "❌ " + error.message;
            }
        }

        ejecutar();
    });
})();
