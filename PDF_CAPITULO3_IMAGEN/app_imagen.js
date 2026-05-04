(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        // ============================================================
        // CONFIGURACIÓN
        // ============================================================
        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ"; 

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // ============================================================
        // FUNCIÓN DE EXPORTACIÓN Y DESCARGA PNG
        // ============================================================
        async function descargarMapaPNG(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                // Expandimos el área un 250% para ver contexto (calles, manzanas)
                const ext = poly.extent.expand(2.5); 
                
                // Convertimos la URL de FeatureServer a MapServer para usar la función export
                const mapServerUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0] + "/MapServer";
                
                // Forzamos la obtención de credenciales institucionales
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const queryParams = {
                    bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                    bboxSR: JSON.stringify(ext.spatialReference),
                    imageSR: JSON.stringify(ext.spatialReference),
                    layers: "show:0",
                    // layerDefs filtra para que solo aparezca el polígono de esta copropiedad
                    layerDefs: JSON.stringify({"0": `objectid = ${oid}`}),
                    size: "1200,900", // Alta resolución
                    format: "png32",
                    transparent: "true",
                    f: "image",
                    token: credential.token
                };

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: queryParams,
                    responseType: "array-buffer"
                });

                // Crear el archivo binario y disparar la descarga
                const uint8Array = new Uint8Array(response.data);
                const imageBlob = new Blob([uint8Array], { type: "image/png" });
                
                window.saveAs(imageBlob, `Plano_Copropiedad_ID_${oid}.png`);
                
                return true;
            } catch (e) {
                console.error("❌ Error exportando mapa:", e);
                return false;
            }
        }

        // ============================================================
        // PROCESO PRINCIPAL
        // ============================================================
        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            
            // Captura el ID de la URL (?objectid=XXX)
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) {
                status.textContent = "Error: No se recibió ID de registro.";
                return;
            }

            if (loader) loader.style.display = "block";

            try {
                status.textContent = "🔐 Validando identidad ArcGIS...";

                // Consultamos el servicio pidiendo la GEOMETRÍA
                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: {
                        objectIds: oid,
                        outFields: "objectid",
                        returnGeometry: true,
                        f: "json"
                    },
                    responseType: "json"
                });

                if (!response.data.features || response.data.features.length === 0) {
                    throw new Error("Registro no encontrado.");
                }

                const feature = response.data.features[0];

                if (feature.geometry) {
                    status.textContent = "🗺️ Generando y descargando imagen PNG...";
                    const exito = await descargarMapaPNG(oid, feature.geometry);
                    
                    if (exito) {
                        status.textContent = "✅ Imagen descargada con éxito.";
                    } else {
                        status.textContent = "❌ Error al generar la imagen.";
                    }
                } else {
                    status.textContent = "⚠️ El registro no tiene polígono asociado.";
                }

                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                status.textContent = "❌ Error: " + error.message;
                if (loader) loader.style.display = "none";
            }
        }

        // Ejecutar inmediatamente
        generar();
    });
})();