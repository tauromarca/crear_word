(function () {
    "use strict";

    const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/Pauta_de_Verficaci%C3%B3n_Vivienda_Araucania_consulta_3/FeatureServer/0";
    const PLANTILLA_URL = "anexo2.docx";

    // Hallazgo 2.1: Sanitización básica
    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    async function obtenerDatosArcGIS(objectId, token) {
        // Consultamos con el token recibido para evitar el Error 499
        const queryUrl = `${FEATURE_LAYER_URL}/query?objectIds=${objectId}&outFields=*&f=json&token=${token}`;
        
        try {
            const response = await fetch(queryUrl);
            const data = await response.json();

            if (data.error) {
                if (data.error.code === 498 || data.error.code === 499) {
                    throw new Error("Su sesión ha expirado o no tiene permisos. Por favor, recargue el mapa.");
                }
                throw new Error(`Error GIS: ${data.error.message}`);
            }

            if (!data.features || data.features.length === 0) {
                throw new Error("No se encontró el registro solicitado.");
            }
            return data.features[0].attributes;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async function generar() {
        const status = document.getElementById("status");
        const urlParams = new URLSearchParams(window.location.search);
        
        const oid = urlParams.get("objectIds");
        const token = urlParams.get("token");

        if (!oid || !token) {
            status.textContent = "Error: Falta ID o Token de seguridad.";
            return;
        }

        try {
            status.textContent = "🔐 Accediendo a datos protegidos...";
            
            // 1. Obtener datos con el token
            const rawData = await obtenerDatosArcGIS(oid, token);
            
            // 2. Hallazgo 2.2: LIMPIEZA DE URL INMEDIATA (Seguridad)
            // Borra el token y el ID de la barra de direcciones para que no se vea ni quede en el historial
            if (window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            const attr = {};
            Object.keys(rawData).forEach(key => {
                let val = rawData[key];
                // Formatear fechas de ArcGIS
                if (typeof val === 'number' && val > 1000000000000) {
                    val = new Date(val).toLocaleDateString("es-CL");
                }
                attr[key] = sanitize(val);
            });

            // 3. Generar Word
            status.textContent = "📝 Generando documento...";
            const templateResp = await fetch(PLANTILLA_URL);
            const content = await templateResp.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, { 
                delimiters: { start: "[[", end: "]]" },
                paragraphLoop: true, linebreaks: true 
            });

            doc.setData(attr);
            doc.render();

            // 4. Descargar
            const docxBlob = doc.getZip().generate({ type: "blob" });
            window.saveAs(docxBlob, `Ficha_Copropiedad_${oid}.docx`);
            
            status.innerHTML = `<div style="color: #27ae60;">✔ Ficha generada con éxito.</div>
                                <p style="font-size:0.8em; color: #666;">Abra el archivo y use 'Exportar a PDF' en su Word.</p>`;

        } catch (error) {
            console.error("Error:", error);
            status.textContent = "❌ " + error.message;
        }
    }

    window.onload = generar;
})();