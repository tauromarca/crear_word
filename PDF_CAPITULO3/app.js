(function () {
    "use strict";

    // Necesitamos cargar el módulo de Identidad de ArcGIS
    require(["esri/identity/IdentityManager", "esri/request"], function(esriId, esriRequest) {

        const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
        const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";


        async function generar() {
            const status = document.getElementById("status");
            const urlParams = new URLSearchParams(window.location.search);
            const oid = urlParams.get("objectIds");

            if (!oid) {
                status.textContent = "Error: ID no recibido.";
                return;
            }

            try {
                status.textContent = "🔐 Verificando credenciales institucionales...";

                // SOLUCIÓN AL ERROR 499: 
                // esriRequest detecta si la capa es privada y pide el token automáticamente
                // al estar logueado en Experience Builder, lo obtiene sin pedir contraseña.
                const response = await esriRequest(`${FEATURE_LAYER_URL}/query`, {
                    query: {
                        objectIds: oid,
                        outFields: "*",
                        f: "json"
                    },
                    responseType: "json"
                });

                const rawData = response.data.features[0].attributes;

                // Limpiar URL (Hallazgo 2.2)
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                // --- EL RESTO DE TU LÓGICA DE GENERACIÓN WORD ---
                status.textContent = "📝 Generando documento...";
                
                // (Aquí sigues con tu fetch de plantilla y docxtemplater...)
                const templateResp = await fetch(PLANTILLA_URL);
                const content = await templateResp.arrayBuffer();
                const zip = new window.PizZip(content);
                const doc = new window.docxtemplater(zip, { 
                    delimiters: { start: "[[", end: "]]" },
                    paragraphLoop: true, linebreaks: true 
                });

                doc.setData(rawData); // O tu función de sanitización
                doc.render();

                const docxBlob = doc.getZip().generate({ type: "blob" });
                window.saveAs(docxBlob, `Ficha_${oid}.docx`);
                
                status.innerHTML = "✔ Generado con éxito.";

            } catch (error) {
                console.error("Error de acceso:", error);
                status.textContent = "❌ No tiene permisos para acceder a estos datos.";
            }
        }

        window.onload = generar;
    });
})();