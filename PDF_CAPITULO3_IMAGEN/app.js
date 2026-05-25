(function () {

    "use strict";

    require([

        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic"

    ], function (

        EsriMap,
        EsriMapView,
        EsriFeatureLayer,
        EsriGraphic

    ) {

        const FS_URL =
        "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_885775529ba244759922b6cef00631de_form/FeatureServer/0";

        async function ejecutar() {

            const status =
                document.getElementById("status");

            const btnWord =
                document.getElementById("btn-word");

            const preview =
                document.getElementById("final-preview");

            const params =
                new URLSearchParams(
                    window.location.search
                );

            const oid =
                params.get("objectid")
                ||
                params.get("oid");

            if (!oid) {

                status.textContent =
                    "Falta objectid";

                return;
            }

            try {

                const map =
                    new EsriMap({

                        basemap: "hybrid"
                    });

                const view =
                    new EsriMapView({

                        container: "map-view",

                        map: map,

                        ui: {
                            components: []
                        }
                    });

                await view.when();

                const layer =
                    new EsriFeatureLayer({

                        url: FS_URL
                    });

                const query =
                    layer.createQuery();

                query.where =
                    `objectid=${oid}`;

                query.returnGeometry =
                    true;

                const result =
                    await layer.queryFeatures(
                        query
                    );

                const feature =
                    result.features[0];

                const graphic =
                    new EsriGraphic({

                        geometry:
                            feature.geometry,

                        symbol: {

                            type:
                                "simple-fill",

                            color:
                                [255,0,0,0.25],

                            outline: {

                                color:
                                    [255,0,0],

                                width: 2
                            }
                        }
                    });

                view.graphics.add(
                    graphic
                );

                await view.goTo({

                    target:
                        graphic.geometry.extent,

                    padding: 40
                });

                await new Promise(resolve => {

                    const handle =
                        view.watch(
                            "updating",
                            val => {

                                if (!val) {

                                    handle.remove();

                                    resolve();
                                }
                            }
                        );
                });

                // =====================================
                // SCREENSHOT
                // =====================================

                const screenshot =
                    await view.takeScreenshot({

                        format: "png",

                        width: 1920,

                        height: 1080
                    });

                preview.src =
                    screenshot.dataUrl;

                preview.style.display =
                    "block";

                // =====================================
                // GUARDAR IMAGEN
                // =====================================

                localStorage.setItem(

                    "imagenArcGIS",

                    screenshot.dataUrl
                );

                // =====================================
                // BOTON WORD
                // =====================================

                btnWord.style.display =
                    "inline-block";

                btnWord.onclick =
                    function () {

                        window.open(

                            "word.html",

                            "_blank"
                        );
                    };

                status.textContent =
                    "Imagen lista";
            }
            catch(error) {

                console.error(error);

                status.textContent =
                    error.message;
            }
        }

        ejecutar();

    });

})();
