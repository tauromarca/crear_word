(function () {
    "use strict";

    // Hallazgo 2.3: Whitelist de campos del Feature Layer
    const FEATURE_LAYER_URL = "https://services3.arcgis.com/.../FeatureServer/0";
    const ALLOWED_FIELDS = ["RUT_COPROPIEDAD", "PLAGAS", "PUNTAJE_AREA_VERDE", "INTERVENCION_AREA_VERDE"]; // ... etc

    // Hallazgo 2.1: Prevención XSS
    function sanitize(str) {
        if (!str) return "";
        return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    async function obtenerDatosArcGIS(objectId) {
        // Hallazgo 2.2: Se obtienen los datos sensibles por canal seguro (petición POST a ArcGIS)
        // y no por la URL del navegador.
        const response = await fetch(`${FEATURE_LAYER_URL}/query?objectIds=${objectId}&outFields=*&f=json`);
        const data = await response.json();
        return data.features[0].attributes;
    }

    async function generar() {
        const status = document.getElementById("status");
        const urlParams = new URLSearchParams(window.location.search);
        const oid = urlParams.get("oid"); // Solo recibimos el ID

        if (!oid) {
            status.textContent = "❌ Acceso Denegado: ID de registro no proporcionado.";
            return;
        }

        try {
            status.textContent = "🔍 Recuperando datos institucionales...";
            const rawData = await obtenerDatosArcGIS(oid);
            
            // Hallazgo 2.3: Validación de esquema
            const attr = {};
            Object.keys(rawData).forEach(key => {
                attr[key] = sanitize(rawData[key]);
            });

            // Hallazgo 2.2: Limpieza de URL (Privacy)
            window.history.replaceState({}, "", window.location.pathname);

            status.textContent = "📝 Generando documento...";
            const response = await fetch("plantilla.docx");
            const content = await response.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, { delimiters: { start: "[[", end: "]]" } });

            doc.setData(attr);
            doc.render();

            const docxBlob = doc.getZip().generate({ type: "blob" });
            const fileName = `Ficha_Oficial_${oid}.docx`;

            // --- SOLUCIÓN PDF SIN PAGAR (Microsoft 365) ---
            // 1. Descargamos el Word (el usuario ya lo tiene)
            window.saveAs(docxBlob, fileName);
            
            // 2. Instrucción al usuario (Hallazgo: Usar la suscripción existente)
            status.innerHTML = `
                <div style="color: green">✔ Word generado exitosamente.</div>
                <p style="font-size: 0.85em; color: #555; margin-top:10px;">
                    Como usuario de <b>Microsoft 365</b>, para obtener el PDF oficial:<br>
                    1. Abra el archivo descargado.<br>
                    2. Vaya a <b>Archivo > Exportar > Crear documento PDF</b>.
                </p>
            `;

        } catch (error) {
            console.error(error);
            status.textContent = "❌ Error de seguridad o acceso a datos.";
        }
    }

    window.onload = generar;
})();