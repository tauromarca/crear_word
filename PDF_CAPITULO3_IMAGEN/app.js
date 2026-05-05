(function () {
    "use strict";

    require([
        "esri/request",
        "esri/identity/IdentityManager",
        "esri/identity/OAuthInfo",
        "esri/geometry/Polygon"
    ], function(esriRequest, esriId, OAuthInfo, Polygon) {

        // URL del FeatureServer
        const FS_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const APP_ID = "V3aGw0JQVKFM6BdJ"; 
        let globalBlob = null;

        const authInfo = new OAuthInfo({ appId: APP_ID, popup: false });
        esriId.registerOAuthInfos([authInfo]);

        // FUNCIÓN CLAVE: Exportación con sintaxis estricta para ArcGIS Online
        async function exportarMapa(oid, geometry) {
            try {
                const poly = new Polygon(geometry);
                const ext = poly.extent.expand(2.5); // Margen de visibilidad
                
                // Convertir la URL de FeatureServer a MapServer raíz
                const mapServerUrl = FS_URL.replace("/FeatureServer/0", "/MapServer");
                
                // Obtener token activo
                const credential = await esriId.getCredential("https://www.arcgis.com/sharing");

                // Construcción manual de parámetros para evitar el error 400 "f"
                const queryParams = {
                    f: "image",
                    format: "png32",
                    size: "1200,900",
                    bbox: `${ext.xmin},${ext.ymin},${ext.xmax},${ext.ymax}`,
                    bboxSR: ext.spatialReference.wkid || 102100,
                    layers: "show:0",
                    // layerDefs debe ser un string JSON {"ID_CAPA":"FILTRO"}
                    layerDefs: JSON.stringify({ "0": "objectid = " + oid }),
                    transparent: "true",
                    token: credential.token
                };

                const response = await esriRequest(`${mapServerUrl}/export`, {
                    query: queryParams,
                    responseType: "blob"
                });

                return response.data;
            } catch (e) {
                console.error("❌ Fallo técnico al exportar:", e);
                return null;
            }
        }

        async function ejecutar() {
            const status = document.getElementById("status");
            const loader = document.getElementById("loader");
            const img = document.getElementById("result-img");
            const placeholder = document.getElementById("placeholder-text");
            const btn = document.getElementById("btn-download");

            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectid") || urlParams.get("oid");

            if (!oid) {
                status.textContent = "Error: Falta ID de registro (?objectid=X)";
                return;
            }

            loader.style.display = "block";

            try {
                status.textContent = "🔐 Autenticando con ArcGIS Online...";

                // 1. Obtener la geometría del polígono
                const response = await esriRequest(`${FS_URL}/query`, {
                    query: {
                        objectIds: oid,
                        outFields: "objectid",
                        returnGeometry: true,
                        f: "json"
                    },
                    responseType: "json"
                });

                if (!response.data.features?.length) throw new Error("No se encontró el registro.");
                const feature = response.data.features[0];

                if (!feature.geometry) throw new Error("El registro no tiene un polígono dibujado.");

                // 2. Exportar la imagen
                status.textContent = "🗺️ Renderizando polígono...";
                const blob = await exportarMapa(oid, feature.geometry);

                if (blob) {
                    globalBlob = blob;
                    
                    // Mostrar imagen en pantalla
                    const imageUrl = URL.createObjectURL(blob);
                    img.src = imageUrl;
                    img.style.display = "block";
                    placeholder.style.display = "none";

                    // Activar botón de descarga
                    btn.style.display = "inline-block";
                    btn.onclick = () => window.saveAs(globalBlob, `Poligono_ID_${oid}.png`);

                    status.textContent = "✅ ¡Mapa generado con éxito!";
                } else {
                    status.textContent = "❌ Falló la creación del mapa.";
                }

            } catch (error) {
                console.error(error);
                status.textContent = "❌ Error: " + error.message;
            } finally {
                loader.style.display = "none";
            }
        }

        ejecutar();
    });
})();