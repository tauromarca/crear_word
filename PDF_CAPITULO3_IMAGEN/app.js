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

        const authInfo = new OAuthInfo({ appId: APP_ID_ARCGIS, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        async function descargarMapaPNG(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                // Expandimos el área para dar contexto al polígono
                const ext = poly.extent.expand(2.5); 
                
                // Limpieza de URL: Obtenemos el MapServer base
                // Resultado esperado: https://.../MapServer
                const baseUrl = FEATURE_LAYER_URL.split("/FeatureServer")[0];
                const exportUrl = `${baseUrl}/MapServer/export`;
                
                // Forzar obtención de credenciales
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                // Definimos los parámetros de forma plana (Strings) para evitar el error 400
                const params = {
                    bbox: ext.xmin + "," + ext.ymin + "," + ext.xmax + "," + ext.ymax,
                    bboxSR: ext.spatialReference.wkid || 102100,
                    imageSR: ext.spatialReference.wkid || 102100,
                    size: "1200,900",
                    format: "png32",
                    layers: "show:0",
                    // layerDefs es crítico: debe ser un string JSON {"0":"objectid=X"}
                    layerDefs: JSON.stringify({ "0": "objectid = " + oid }),
                    transparent: "true",
                    f: "image",
                    token: credential.token
                };

                console.log("🗺️ Solicitando exportación a:", exportUrl);

                const response = await esriRequest(exportUrl, {
                    query: params,
                    responseType: "array-buffer"
                });

                // Descarga del archivo usando FileSaver
                const uint8Array = new Uint8Array(response.data);
                const imageBlob = new Blob([uint8Array], { type: "image/png" });
                window.saveAs(imageBlob, `Poligono_ID_${oid}.png`);
                
                return true;
            } catch (e) {
                // Si hay un error, mostramos el detalle técnico en consola
                console.error("❌ Error detallado en ArcGIS:", e);
                if (e.details && e.details.messages) {
                    console.error("Mensaje del servidor:", e.details.messages[0]);
                }
                return false;
            }
        }

        async function generar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) {
                status.textContent = "Error: No se recibió ID.";
                return;
            }

            if (loader) loader.style.display = "block";

            try {
                status.textContent = "🔐 Validando identidad institucional...";

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
                    status.textContent = "🗺️ Generando y descargando PNG...";
                    const exito = await descargarMapaPNG(oid, feature.geometry);
                    status.textContent = exito ? "✅ Descarga exitosa" : "❌ Error en generación";
                } else {
                    status.textContent = "⚠️ El registro no tiene polígono.";
                }

                if (loader) loader.style.display = "none";

            } catch (error) {
                console.error(error);
                status.textContent = "❌ " + error.message;
                if (loader) loader.style.display = "none";
            }
        }

        generar();
    });
})();