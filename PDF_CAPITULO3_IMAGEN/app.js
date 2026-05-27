(function () {

   "use strict";

   require([
   
       "esri/Map",
       "esri/views/MapView",
       "esri/layers/FeatureLayer",
       "esri/Graphic",
       "esri/identity/IdentityManager",
       "esri/identity/OAuthInfo",
       "esri/request"
   
   ], function (
   
       EsriMap,
       EsriMapView,
       EsriFeatureLayer,
       EsriGraphic,
       esriId,
       OAuthInfo,
       esriRequest
   
   ) {
        const FS_URL =
        "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_885775529ba244759922b6cef00631de_form/FeatureServer/0";

        // =====================================
        // FUNCIONES TABLA PRIORIZADA
        // =====================================

        function getVal(obj, field) {

            return obj && obj[field] != null
                ? obj[field]
                : "";
        }
        function valorCheck(valor) {
        
            const valorRaw =
                String(valor || "")
                .toLowerCase();
        
            return (
                valorRaw.includes("si")
                ||
                valorRaw.includes("sí")
            )
        
            ? "☑"
        
            : "☐";
        }
        function prepararTablaPriorizada(rawData, domainMap) {

            const getLabel = (f, v) =>

                (domainMap[f] &&
                 domainMap[f][v] !== undefined)

                ? domainMap[f][v]

                : v;

            let partidas = [

                {
                    nombre:
                        "A. Áreas Verdes y Equipamiento",

                    p:
                        getVal(rawData, "a_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion",
                            getVal(rawData, "tipo_intervencion")
                        )
                },

                {
                    nombre:
                        "B. Cierres Perimetrales",

                    p:
                        getVal(rawData, "b_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion_perimetrales",
                            getVal(rawData, "tipo_intervencion_perimetrales")
                        )
                },

                {
                    nombre:
                        "C. Techumbre",

                    p:
                        getVal(rawData, "c_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion_techumbre",
                            getVal(rawData, "tipo_intervencion_techumbre")
                        )
                },

                {
                    nombre:
                        "D. Ascensores, Escaleras y/o Circulaciones",

                    p:
                        getVal(rawData, "d_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion_escaleras",
                            getVal(rawData, "tipo_intervencion_escaleras")
                        )
                },

                {
                    nombre:
                        "E. Fachadas y/o Muros",

                    p:
                        getVal(rawData, "e_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion_fachada",
                            getVal(rawData, "tipo_intervencion_fachada")
                        )
                },

                {
                    nombre:
                        "F. Sistemas de Iluminación",

                    p:
                        getVal(rawData, "f_ponderado"),

                    intervencion:
                        getLabel(
                            "tipo_intervencion_iluminaria",
                            getVal(rawData, "tipo_intervencion_iluminaria")
                        )
                },

                {
                    nombre:
                        "G. Redes de Servicio",

                    p:
                        getVal(rawData, "g_ponderado"),

                    intervencion:
                        getLabel(
                            "Tipo_Intervencion_Redes_servicios",
                            getVal(rawData, "Tipo_Intervencion_Redes_servicios")
                        )
                },

                {
                    nombre:
                        "K. Accesibilidad Universal",

                    p:
                        getVal(rawData, "k_ponderado"),

                    intervencion:
                        "No aplica"
                }
            ];

            partidas.sort(

                (a, b) =>

                parseFloat(b.p || 0)
                -
                parseFloat(a.p || 0)
            );

            return partidas.map(item => ({

                nombre:
                    item.nombre,

                p:
                    !isNaN(parseFloat(item.p))
                    ? parseFloat(item.p).toFixed(4)
                    : "0.0000",

                intervencion:
                    item.intervencion || ""
            }));
        }

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
                  // REUTILIZAR SESIÓN DE EXPERIENCE BUILDER
                  // =====================================
                  
                  const info = new OAuthInfo({
                  
                      appId: "aeNAdAP7A0xhb786",
                  
                      portalUrl: "https://www.arcgis.com",
                  
                      popup: false
                  });
                  
                  esriId.registerOAuthInfos([info]);
                  
                  esriId.enablePostMessageAuth();
                  
                  try {
                  
                      await esriId.checkSignInStatus(
                          info.portalUrl + "/sharing"
                      );
                  
                      console.log(
                          "Sesión ArcGIS reutilizada"
                      );
                  
                  }
                  catch {
                  
                      console.log(
                          "No existe sesión activa"
                      );
                  
                      await esriId.getCredential(
                          info.portalUrl + "/sharing"
                      );
                  }
  
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

                        url: FS_URL,

                        outFields: ["*"]
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
                // CHECKBOXES
                // =====================================
                
                const checks = {
                
                    PLAGAS:
                        valorCheck(
                            atributos.requiere_plagas
                        ),
                
                    ASBELTO_CUBIERTA:
                        valorCheck(
                            atributos.requiere_asbesto_cubierta
                        ),
                
                    ASBELTO_FACHADA:
                        valorCheck(
                            atributos.requiere_asbesto_fachada
                        ),
                
                    ASBELTO_LOGGIA:
                        valorCheck(
                            atributos.requiere_asbesto_logia
                        ),
                
                    ASBELTO_REDES:
                        valorCheck(
                            atributos.requiere_asbesto_redes
                        ),
                
                    RIESGO_REDES:
                        valorCheck(
                            atributos.riesgo_redes_grave_deterioro
                        ),
                
                    RIESGO_ESTRUCTURA:
                        valorCheck(
                            atributos.riesgo_estructura_grave_deterioro
                        ),
                
                    RIESGO_ESCALERAS:
                        valorCheck(
                            atributos.riesgo_escaleras_grave_deterioro
                        ),
                
                    RIESGO_TECHUMBRE:
                        valorCheck(
                            atributos.riesgo_techumbre_grave_deterioro
                        ),
                
                    REGULACION:
                        valorCheck(
                            atributos.requiere_regularizacion
                        ),
                
                    EFICIENCIA_ENERGETICA:
                        valorCheck(
                            atributos.eficiencia_energetica
                        ),
                
                    ACONDICIONAMIENTO:
                        valorCheck(
                            atributos.acondicionamiento_termico
                        )
                };
                
                console.log(
                    "Checks:",
                    checks
                );
                                
                // =====================================
                // TABLA PRIORIZADA
                // =====================================

                const tabla_priorizada =
                    prepararTablaPriorizada(
                        atributos,
                        {}
                    );

                console.log(
                    "Tabla priorizada:",
                    tabla_priorizada
                );

                // =====================================
                // GUARDAR DATOS WORD
                // =====================================

                localStorage.setItem(

                    "datosWord",

                    JSON.stringify({
                        ...checks,
                        copropiedad_formalizada:
                            atributos.copropiedad_formalizada || "",

                        rut_copropiedad:
                            atributos.rut_copropiedad || "",

                        nombre_conjunto:
                            atributos.nombre_conjunto || "",

                        codigo_conjunto:
                            atributos.codigo_conjunto || "",
                        nombre_copropiedad:
                            atributos.nombre_copropiedad || "",
                        copropiedad_beneficio:
                            atributos.copropiedad_beneficio || "",
                        obras_realizadas:
                            atributos.obras_realizadas || "",
                        nombre_direccion:
                            atributos.nombre_direccion || "",
                        numero_direccion:
                            atributos.numero_direccion || "",
                        comuna:
                            atributos.comuna || "",
                        n_departamentos:
                            atributos.n_departamentos || "",
                        superficie_promedio:
                            atributos.superficie_promedio || "",
                        anio_recepcion:
                            atributos.anio_recepcion || "",
                        nombre_revisor_ep:
                            atributos.nombre_revisor_ep || "",
                        representante_legal:
                            atributos.representante_legal || "",
                        rut_entidad:
                            atributos.rut_entidad || "",
                        nombre_revisor_ep:
                            atributos.nombre_revisor_ep || "",
                        rut_revisor_ep:
                            atributos.rut_revisor_ep || "",
                        email_revidor_ep:
                            atributos.email_revidor_ep || "",
                        nombre_dirigente:
                            atributos.nombre_dirigente || "",
                        rut_dirigente:
                            atributos.rut_dirigente || "",
                        email_dirigente:
                            atributos.email_dirigente || "",
                        enlace_fotos:
                            atributos.enlace_fotos || "",
                        tabla_priorizada:
                            tabla_priorizada,

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
