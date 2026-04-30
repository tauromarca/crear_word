(function () {
    "use strict";

    const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
    const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    // Hallazgo 4.2: Autenticación y Autorización
    async function obtenerDatosArcGIS(objectId, token) {
        // Incluimos el token en la petición para resolver el error 499
        let queryUrl = `${FEATURE_LAYER_URL}/query?objectIds=${objectId}&outFields=*&f=json`;
        
        if (token) {
            queryUrl += `&token=${token}`;
        }
        
        try {
            const response = await fetch(queryUrl);
            const data = await response.json();

            if (data.error) {
                // Si el token expiró o es inválido
                if (data.error.code === 498 || data.error.code === 499) {
                    throw new Error("Su sesión ha expirado. Por favor, recargue Experience Builder.");
                }
                throw new Error(`ArcGIS Error ${data.error.code}: ${data.error.message}`);
            }

            if (!data.features || data.features.length === 0) {
                throw new Error("No tiene permisos para ver este registro o el ID es inválido.");
            }
            
            return data.features[0].attributes;
        } catch (error) {
            throw new Error("Fallo de seguridad/acceso: " + error.message);
        }
    }

    async function generar() {
        const status = document.getElementById("status");
        const urlParams = new URLSearchParams(window.location.search);
        
        const oid = urlParams.get("objectIds") || urlParams.get("oid") || urlParams.get("objectid");
        const token = urlParams.get("token"); // Capturamos el token de la URL

        if (!oid) {
            status.textContent = "Acceso Denegado: No se proporcionó un ID de registro.";
            return;
        }

        try {
            status.textContent = "🔐 Autenticando con el servidor GIS...";
            const rawData = await obtenerDatosArcGIS(oid, token);
            
            // Hallazgo 2.2: LIMPIEZA INMEDIATA DE LA URL
            // Esto borra el Token y el ID de la vista del usuario y de los logs del navegador
            if (window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            const attr = {};
            Object.keys(rawData).forEach(key => {
                let val = rawData[key];
                if (typeof val === 'number' && val > 1000000000000) {
                    val = new Date(val).toLocaleDateString("es-CL");
                }
                attr[key] = sanitize(val);
            });

            status.textContent = "📝 Generando documento oficial...";
            const templateResp = await fetch(PLANTILLA_URL);
            if (!templateResp.ok) throw new Error("Plantilla institucional no accesible.");
            
            const content = await templateResp.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, { 
                delimiters: { start: "[[", end: "]]" },
                paragraphLoop: true, linebreaks: true 
            });

            doc.setData(attr);
            doc.render();

            const docxBlob = doc.getZip().generate({ type: "blob" });
            window.saveAs(docxBlob, `Ficha_Institucional_${oid}.docx`);
            
            status.innerHTML = `<div style="color: #27ae60; font-weight: bold;">✔ Documento generado exitosamente.</div>
                                <p style="font-size:0.85em; color: #555;">Abra el archivo y use 'Exportar a PDF' en su Office 365.</p>`;

        } catch (error) {
            console.error("Error de auditoría:", error);
            status.textContent = "❌ " + error.message;
        }
    }

    window.onload = generar;
})();