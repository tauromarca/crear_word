(function () {
    "use strict";

    //const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/Pauta_de_Verficaci%C3%B3n_Vivienda_Araucania_consulta_3/FeatureServer/0";
    
    const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0";
    
    const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";

    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    // Hallazgo 2.2: Obtención segura de datos
    async function obtenerDatosArcGIS(objectid) {
        // Intentamos detectar el nombre del campo ID (OBJECTID, fid, etc.)
        // Usamos una consulta general para obtener el primer registro y ver cómo se llama su ID
        // o simplemente usamos una consulta 'where' que es más estándar.
        
        // Probamos con la sintaxis estándar de filtrado por ID
        const queryUrl = `${FEATURE_LAYER_URL}/query?where=1%3D1&objectid=${objectid}&outFields=*&f=json`;
        
        try {
            const response = await fetch(queryUrl);
            const data = await response.json();

            // LOG DE DIAGNÓSTICO (Revisar en Consola F12)
            console.log("Respuesta de ArcGIS:", data);

            if (data.error) {
                throw new Error(`ArcGIS Error ${data.error.code}: ${data.error.message}`);
            }

            if (!data.features || data.features.length === 0) {
                // Si el ID no funciona, intentamos una búsqueda por campo OBJECTID explícito
                const retryUrl = `${FEATURE_LAYER_URL}/query?where=objectid%3D${objectid}+OR+objectid%3D${objectid}+OR+fid%3D${objectId}&outFields=*&f=json`;
                const retryResp = await fetch(retryUrl);
                const retryData = await retryResp.json();
                
                if (!retryData.features || retryData.features.length === 0) {
                    throw new Error("No se encontró el registro. Verifique que el ID sea correcto y que el servicio sea público.");
                }
                return retryData.features[0].attributes;
            }
            
            return data.features[0].attributes;
        } catch (error) {
            throw new Error("Fallo de conexión a base de datos GIS: " + error.message);
        }
    }

    async function generar() {
        const status = document.getElementById("status");
        const urlParams = new URLSearchParams(window.location.search);
        
        // Capturamos el ID de cualquier variante posible en la URL
        const oid = urlParams.get("objectIds") || urlParams.get("oid") || urlParams.get("objectid") || urlParams.get("OBJECTID");

        if (!oid) {
            status.textContent = "Acceso Denegado: No se proporcionó un ID válido.";
            return;
        }

        try {
            status.textContent = "🔐 Accediendo a datos seguros...";
            const rawData = await obtenerDatosArcGIS(oid);
            
            // Hallazgo 2.2: Limpiar URL inmediatamente
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

            status.textContent = "📝 Generando documento...";
            const templateResp = await fetch(PLANTILLA_URL);
            if (!templateResp.ok) throw new Error("No se pudo cargar la plantilla local.");
            
            const content = await templateResp.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, { 
                delimiters: { start: "[[", end: "]]" },
                paragraphLoop: true, linebreaks: true 
            });

            doc.setData(attr);
            doc.render();

            const docxBlob = doc.getZip().generate({ type: "blob" });
            window.saveAs(docxBlob, `Ficha_Sede_Araucania_${oid}.docx`);
            
            status.innerHTML = `<div style="color: green;">✔ Generado exitosamente.</div>
                                <p style="font-size:0.8em;">Use Microsoft 365 para exportar a PDF.</p>`;

        } catch (error) {
            console.error("Error en flujo seguro:", error);
            status.textContent = "❌ " + error.message;
        }
    }

    window.onload = generar;
})();