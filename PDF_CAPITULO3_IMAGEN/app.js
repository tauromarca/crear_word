(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const APP_ID_ARCGIS = "V3aGw0JQVKFM6BdJ"; 
        let currentBlob = null; // Variable global para guardar la imagen

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        async function obtenerImagenMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5); 
                
                // LIMPIEZA DE URL (Eliminamos /0 y FeatureServer)
                const baseUrl = FEATURE_LAYER_URL.split("/rest/services/")[0];
                const servicePath = FEATURE_LAYER_URL.split("/rest/services/")[1].split("/FeatureServer")[0];
                const mapServerUrl = `${baseUrl}/rest/services/${servicePath}/MapServer/export`;
                
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                const queryParams = {
                    bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                    bboxSR: ext.spatialReference.wkid || 102100,
                    layers: "show:0",
                    layerDefs: `{"0":"objectid = ${oid}"}`, // Sintaxis JSON estricta
                    size: "1200,900",
                    format: "png32",
                    transparent: "true",
                    f: "image",
                    token: credential.token
                };

                const response = await esriRequest(mapServerUrl, {
                    query: queryParams,
                    responseType: "blob" // Cambiado a blob para visualización directa
                });

                return response.data;
            } catch (e) {
                console.error("❌ Fallo crítico en ArcGIS:", e);
                return null;
            }
        }

        async function iniciar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const imgElement = document.getElementById("map-image");
            const btnDownload = document.getElementById("download-btn");
            
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) {
                status.textContent = "Error: No se recibió ID de registro.";
                return;
            }

            loader.style.display = "block";

            try {
                status.textContent = "🔐 Validando identidad institucional...";

                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: { objectIds: oid, outFields: "objectid", returnGeometry: true, f: "json" },
                    responseType: "json"
                });

                if (!response.data.features?.length) throw new Error("Registro no encontrado.");
                
                const feature = response.data.features[0];

                if (feature.geometry) {
                    status.textContent = "🗺️ Generando mapa del polígono...";
                    
                    const blob = await obtenerImagenMapa(oid, feature.geometry);
                    
                    if (blob) {
                        currentBlob = blob; // Guardamos para la descarga
                        
                        // Mostrar en pantalla
                        const url = URL.createObjectURL(blob);
                        imgElement.src = url;
                        imgElement.style.display = "block";
                        
                        // Activar botón de descarga
                        btnDownload.style.display = "inline-block";
                        btnDownload.onclick = () => window.saveAs(currentBlob, `Poligono_ID_${oid}.png`);
                        
                        status.textContent = "✅ Mapa generado exitosamente.";
                    } else {
                        status.textContent = "❌ No se pudo generar la imagen.";
                    }
                } else {
                    status.textContent = "⚠️ El registro no tiene geometría.";
                }

                loader.style.display = "none";

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
                loader.style.display = "none";
            }
        }

        iniciar();
    });
})();