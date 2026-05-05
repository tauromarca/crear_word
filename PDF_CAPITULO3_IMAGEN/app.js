(function () {
    "use strict";

    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo"
    ], function(Map, MapView, FeatureLayer, Graphic, esriId, OAuthInfo) {

        const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const APP_ID = "V3aGw0JQVKFM6BdJ"; 
        let view;

        const authInfo = new OAuthInfo({ appId: APP_ID, popup: false });
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
                status.textContent = "Error: Falta ID de registro.";
                return;
            }

            loader.style.display = "block";

            try {
                status.textContent = "🔐 Autenticando acceso...";
                await esriId.getCredential("https://www.arcgis.com/sharing");

                // 1. Configurar el Mapa y la Capa
                const layer = new FeatureLayer({
                    url: FS_URL,
                    definitionExpression: `objectid = ${oid}`,
                    renderer: {
                        type: "simple",
                        symbol: {
                            type: "simple-fill",
                            color: [0, 197, 255, 0.3], // Celeste transparente
                            outline: { color: [0, 197, 255, 1], width: 2 } // Borde azul
                        }
                    }
                });

                const map = new Map({
                    basemap: "topo-vector", // Puedes cambiar a "satellite" si prefieres
                    layers: [layer]
                });

                view = new MapView({
                    container: "map-view",
                    map: map,
                    ui: { components: [] } // Quitar botones de zoom para imagen limpia
                });

                status.textContent = "🗺️ Localizando polígono...";

                // 2. Esperar a que la capa cargue y centrar la vista
                await view.when();
                const query = layer.createQuery();
                query.where = `objectid = ${oid}`;
                query.returnGeometry = true;
                
                const result = await layer.queryFeatures(query);
                
                if (result.features.length === 0) throw new Error("No se encontró el polígono.");
                
                const feature = result.features[0];
                
                // Centrar el mapa en el polígono con un margen
                await view.goTo(feature.geometry.extent.expand(2.5));
                
                status.textContent = "📸 Generando PNG de alta resolución...";

                // 3. Tomar la "foto" del mapa (Screenshot)
                // Esperamos un momento para que los tiles del mapa base carguen
                setTimeout(async () => {
                    const screenshot = await view.takeScreenshot({
                        format: "png",
                        quality: 100,
                        width: 1200,
                        height: 900
                    });

                    // 4. Mostrar en pantalla y preparar descarga
                    previewImg.src = screenshot.dataUrl;
                    previewImg.style.display = "block";
                    mapViewDiv.style.display = "none"; // Ocultamos el mapa interactivo

                    btn.style.display = "inline-block";
                    btn.onclick = () => {
                        window.saveAs(screenshot.dataUrl, `Poligono_ID_${oid}.png`);
                    };

                    status.textContent = "✅ ¡Imagen lista para descargar!";
                    loader.style.display = "none";
                }, 2000); // 2 segundos de espera para carga de mapa base

            } catch (error) {
                console.error(error);
                status.textContent = "❌ Error: " + error.message;
                loader.style.display = "none";
            }
        }

        ejecutar();
    });
})();