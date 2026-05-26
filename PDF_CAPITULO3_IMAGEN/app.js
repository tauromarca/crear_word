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

                // =====================================
                // MAPA
                // =====================================

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

                // =====================================
                // FEATURE LAYER
                // =====================================

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
                        "No existe feature"
                    );
                }

                const feature =
                    result.features[0];

                console.log(
                    "Feature:",
                    feature
                );
                // =====================================
                // ATTACHMENTS
                // =====================================
                
                const attachments =
                    await layer.queryAttachments({
                
                        objectIds: [oid]
                    });
                
                console.log(
                    "Attachments:",
                    attachments
                );
                
                const listaAdjuntos =
                    attachments[oid] || [];
                
                const imagenesAdjuntas = [];
                
                for (const adj of listaAdjuntos) {
                
                    // Solo imagenes
                    if (
                        adj.contentType &&
                        adj.contentType.startsWith(
                            "image/"
                        )
                    ) {
                
                        const imageUrl =
                            adj.url;
                
                        console.log(
                            "Descargando:",
                            imageUrl
                        );
                
                        const response =
                            await fetch(
                                imageUrl
                            );
                
                        const blob =
                            await response.blob();
                
                        const dataUrl =
                            await new Promise(resolve => {
                
                                const reader =
                                    new FileReader();
                
                                reader.onload =
                                    () => resolve(
                                        reader.result
                                    );
                
                                reader.readAsDataURL(
                                    blob
                                );
                            });
                
                        imagenesAdjuntas.push({
                
                            nombre:
                                adj.name,
                
                            dataUrl:
                                dataUrl
                        });
                    }
                }
                
                // =====================================
                // GUARDAR ATTACHMENTS
                // =====================================
                
                localStorage.setItem(
                
                    "imagenesAdjuntas",
                
                    JSON.stringify(
                        imagenesAdjuntas
                    )
                );
                
                console.log(
                    "Imagenes adjuntas:",
                    imagenesAdjuntas
                );
                // =====================================
                // ATRIBUTOS
                // =====================================

                const atributos =
                    feature.attributes;

                console.log(
                    "Atributos:",
                    atributos
                );

                // =====================================
                // GUARDAR DATOS WORD
                // =====================================

                localStorage.setItem(

                    "datosWord",

                    JSON.stringify({

                        copropiedad_formalizada:
                            atributos.copropiedad_formalizada || "",
 
                        rut_copropiedad:
                            atributos.rut_copropiedad || "",

                        nombre_conjunto:
                            atributos.nombre_conjunto || "",
                        codigo_conjunto:
                            atributos.codigo_conjunto || "",

                        objectid:
                            atributos.objectid || oid
                    })
                );

                // =====================================
                // GRAFICO
                // =====================================

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

                // =====================================
                // ZOOM
                // =====================================

                await view.goTo({

                    target:
                        graphic.geometry.extent.expand(2),

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
                    "Imagen y datos listos";
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
