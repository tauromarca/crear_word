(function () {

    "use strict";

    require([

        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo"

    ], function (

        Map,
        MapView,
        FeatureLayer,
        Graphic,
        esriId,
        OAuthInfo

    ) {

        // =====================================================
        // CONFIGURACION
        // =====================================================

        const FS_URL =
            "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_b91310d4b733410381db831ffab56a68_form/FeatureServer/0";

        const APP_ID =
            "V3aGw0JQVKFM6BdJ";

        // =====================================================
        // AUTH
        // =====================================================

        const authInfo =
            new OAuthInfo({

                appId: APP_ID,
                popup: false
            });

        esriId.registerOAuthInfos([
            authInfo
        ]);

        // =====================================================
        // FUNCION PRINCIPAL
        // =====================================================

        async function ejecutar() {

            const status =
                document.getElementById("status");

            const loader =
                document.getElementById("loader");

            const btnWord =
                document.getElementById("btn-word");

            const previewImg =
                document.getElementById("final-preview");

            const mapViewDiv =
                document.getElementById("map-view");

            const urlParams =
                new URLSearchParams(
                    window.location.search
                );

            const oid =
                urlParams.get("objectid")
                ||
                urlParams.get("oid");

            if (!oid) {

                status.textContent =
                    "❌ Falta objectid";

                return;
            }

            loader.style.display =
                "block";

            try {

                // =============================================
                // LOGIN
                // =============================================

                status.textContent =
                    "🔐 Autenticando...";

                await esriId.getCredential(
                    "https://www.arcgis.com/sharing"
                );

                // =============================================
                // MAPA
                // =============================================

                const map =
                    new Map({

                        basemap: "hybrid"
                    });

                const view =
                    new MapView({

                        container: "map-view",

                        map: map,

                        ui: {
                            components: []
                        }
                    });

                await view.when();

                // =============================================
                // FEATURE LAYER
                // =============================================

                status.textContent =
                    "📡 Consultando capa...";

                const layer =
                    new FeatureLayer({

                        url: FS_URL
                    });

                const query =
                    layer.createQuery();

                query.where =
                    `objectid = ${oid}`;

                query.returnGeometry =
                    true;

                query.outFields =
                    ["*"];

                const result =
                    await layer.queryFeatures(
                        query
                    );

                if (
                    !result.features.length
                ) {

                    throw new Error(
                        "No se encontró polígono"
                    );
                }

                const feature =
                    result.features[0];

                if (
                    !feature.geometry
                ) {

                    throw new Error(
                        "Sin geometría"
                    );
                }

                // =============================================
                // GRAFICO
                // =============================================

                status.textContent =
                    "🧩 Dibujando polígono...";

                const graphic =
                    new Graphic({

                        geometry:
                            feature.geometry,

                        symbol: {

                            type:
                                "simple-fill",

                            color:
                                [255, 0, 0, 0.25],

                            outline: {

                                color:
                                    [255, 0, 0, 1],

                                width: 2
                            }
                        }
                    });

                view.graphics.removeAll();

                view.graphics.add(
                    graphic
                );

                // =============================================
                // ZOOM
                // =============================================

                await view.goTo({

                    target:
                        graphic.geometry.extent,

                    padding: 40
                });

                // =============================================
                // ESPERAR RENDER
                // =============================================

                await view.when();

                await new Promise(resolve => {

                    const handle =
                        view.watch(
                            "updating",
                            (val) => {

                                if (val === false) {

                                    handle.remove();

                                    resolve();
                                }
                            }
                        );
                });

                // =============================================
                // SCREENSHOT
                // =============================================

                status.textContent =
                    "📸 Generando imagen...";

                const screenshot =
                    await view.takeScreenshot({

                        format: "png",

                        quality: 100,

                        width: 1920,

                        height: 1080
                    });

                // =============================================
                // PREVIEW
                // =============================================

                previewImg.src =
                    screenshot.dataUrl;

                previewImg.style.display =
                    "block";

                mapViewDiv.style.display =
                    "none";

                // =============================================
                // BOTON WORD
                // =============================================

                btnWord.style.display =
                    "inline-block";

                btnWord.onclick =
                    async function () {

                        try {

                            status.textContent =
                                "📝 Generando Word...";

                            // ============================
                            // BASE64 → ARRAY BUFFER
                            // ============================

                            const response =
                                await fetch(
                                    screenshot.dataUrl
                                );

                            const imageBuffer =
                                await response.arrayBuffer();

                            // ============================
                            // CREAR WORD
                            // ============================

                            const doc =
                                new docx.Document({

                                    sections: [

                                        {

                                            properties: {},

                                            children: [

                                                new docx.Paragraph({

                                                    children: [

                                                        new docx.TextRun({

                                                            text:
                                                                `Polígono OBJECTID ${oid}`,

                                                            break: 2,

                                                            bold: true,

                                                            size: 32
                                                        })
                                                    ]
                                                }),

                                                new docx.Paragraph({

                                                    children: [

                                                        new docx.ImageRun({

                                                            data:
                                                                imageBuffer,

                                                            transformation: {

                                                                width: 600,

                                                                height: 350
                                                            }
                                                        })
                                                    ]
                                                })
                                            ]
                                        }
                                    ]
                                });

                            // ============================
                            // GENERAR DOCX
                            // ============================

                            const blob =
                                await docx.Packer
                                .toBlob(doc);

                            // ============================
                            // DESCARGAR
                            // ============================

                            saveAs(

                                blob,

                                `Poligono_${oid}.docx`
                            );

                            status.textContent =
                                "✅ Word generado";
                        }
                        catch (error) {

                            console.error(error);

                            status.textContent =
                                "❌ Error Word";
                        }
                    };

                loader.style.display =
                    "none";

                status.textContent =
                    "✅ Imagen lista";

            }
            catch (error) {

                console.error(error);

                loader.style.display =
                    "none";

                status.textContent =
                    "❌ " + error.message;
            }
        }

        ejecutar();
    });

})();
