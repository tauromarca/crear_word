(function () {

    "use strict";

    require([

        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic"

    ], function (

        Map,
        MapView,
        FeatureLayer,
        Graphic

    ) {

        const FS_URL =
            "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_b91310d4b733410381db831ffab56a68_form/FeatureServer/0";

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

                // =====================================
                // MAPA
                // =====================================

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

                // =====================================
                // CAPA
                // =====================================

                const layer =
                    new FeatureLayer({

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

                if (
                    !result.features.length
                ) {

                    throw new Error(
                        "No existe polígono"
                    );
                }

                const feature =
                    result.features[0];

                // =====================================
                // GRAFICO
                // =====================================

                const graphic =
                    new Graphic({

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

                // esperar render
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

                status.textContent =
                    "Generando imagen...";

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
                // BOTON WORD
                // =====================================

                btnWord.style.display =
                    "inline-block";

                btnWord.onclick =
                    async function () {

                        try {

                            status.textContent =
                                "Generando Word...";

                            // =========================
                            // IMG BUFFER
                            // =========================

                            const response =
                                await fetch(
                                    screenshot.dataUrl
                                );

                            const imageBuffer =
                                await response.arrayBuffer();

                            // =========================
                            // WORD
                            // =========================

                            const doc =
                                new docx.Document({

                                    sections: [

                                        {

                                            children: [

                                                new docx.Paragraph({

                                                    children: [

                                                        new docx.TextRun({

                                                            text:
                                                                "Mapa del Polígono",

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

                            // =========================
                            // BLOB
                            // =========================

                            const blob =
                                await docx.Packer.toBlob(doc);

                            // =========================
                            // DESCARGAR
                            // =========================

                            saveAs(

                                blob,

                                `Poligono_${oid}.docx`
                            );

                            status.textContent =
                                "Word generado";
                        }
                        catch (error) {

                            console.error(error);

                            status.textContent =
                                error.message;
                        }
                    };

                status.textContent =
                    "Imagen lista";
            }
            catch (error) {

                console.error(error);

                status.textContent =
                    error.message;
            }
        }

        ejecutar();

    });

})();
