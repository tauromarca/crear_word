(function () {
    "use strict";

    // =========================================================================
    // CONFIGURACIÓN: URL de consulta segura (AKS -> ArcGIS)
    // =========================================================================
    //const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/Pauta_de_Verficaci%C3%B3n_Vivienda_Araucania_consulta_3/FeatureServer/0";

    const FEATURE_LAYER_URL = "https://services3.arcgis.com/cTnMkBRk4HWkUCRo/arcgis/rest/services/service_8198050eccc3491bb7aa36011a48571b_form/FeatureServer/0"
    const PLANTILLA_URL = "anexo2.docx";

    // Hallazgo 2.1: Sanitización para evitar XSS
    function sanitize(str) {
        if (str === null || str === undefined) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    // Hallazgo 2.2: Obtener datos reales desde el servidor (No confiar en la URL)
    async function obtenerDatosArcGIS(objectId) {
        // Se usa fetch para obtener la información completa y fidedigna
        const queryUrl = `${FEATURE_LAYER_URL}/query?objectIds=${objectId}&outFields=*&f=json`;
        
        try {
            const response = await fetch(queryUrl);
            if (!response.ok) throw new Error("Servicio de datos no disponible.");
            
            const data = await response.json();
            if (!data.features || data.features.length === 0) {
                throw new Error("El registro no existe o no tiene permisos para verlo.");
            }
            return data.features[0].attributes;
        } catch (error) {
            throw new Error("Error de integridad de datos: " + error.message);
        }
    }

    async function generar() {
        const status = document.getElementById("status");
        const urlParams = new URLSearchParams(window.location.search);
        
        // Soporte para 'objectIds' (según tu URL), 'oid' o 'objectid'
        const oid = urlParams.get("objectIds") || urlParams.get("oid") || urlParams.get("objectid");

        if (!oid) {
            status.textContent = "Acceso Denegado: Credencial de registro (ID) no detectada.";
            return;
        }

        try {
            status.textContent = "🔐 Validando y recuperando datos seguros...";
            
            // Hallazgo 2.2 y 2.3: Ignoramos los datos de la URL y bajamos los originales
            const rawData = await obtenerDatosArcGIS(oid);
            
            // Hallazgo 2.2: LIMPIEZA INMEDIATA DE LA URL
            // Borra el RUT y el ID de la barra de direcciones para que no queden en logs/historial
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

            status.textContent = "📝 Generando documento oficial...";
            const templateResp = await fetch(PLANTILLA_URL);
            if (!templateResp.ok) throw new Error("Plantilla institucional no encontrada.");
            
            const content = await templateResp.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, { 
                delimiters: { start: "[[", end: "]]" },
                paragraphLoop: true,
                linebreaks: true 
            });

            doc.setData(attr);
            doc.render();

            const docxBlob = doc.getZip().generate({ type: "blob" });
            const fileName = `Ficha_Segura_${oid}.docx`;

            // Descarga local
            window.saveAs(docxBlob, fileName);
            
            // Mensaje de éxito con instrucciones PDF (M365)
            status.innerHTML = `
                <div style="color: #27ae60; font-size: 1.1em;">✔ Documento generado exitosamente.</div>
                <div style="text-align: left; background: #f9f9f9; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #ddd;">
                    <p style="margin-top:0"><b>Instrucciones PDF (M365):</b></p>
                    <ol style="font-size: 0.85em; color: #333;">
                        <li>Abra el archivo descargado en su Word institucional.</li>
                        <li>Vaya al menú <b>Archivo</b>.</li>
                        <li>Seleccione <b>Exportar</b> y luego <b>Crear documento PDF</b>.</li>
                    </ol>
                </div>
            `;

        } catch (error) {
            console.error("Brecha detectada:", error);
            status.textContent = "❌ Error: " + error.message;
        }
    }

    window.onload = generar;
})();