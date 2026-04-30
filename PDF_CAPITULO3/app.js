(function () {
    "use strict";

    const PLANTILLA_URL = "PLANTILLA VISUALIZACIÓN DTC.docx";
    // Hallazgo 2.2: Para PDF automático, se recomienda ConvertAPI (250 conv. gratis/mes)
    const CONVERT_API_SECRET = "TU_SECRET_KEY_AQUI"; 

    // Hallazgo 2.3: Lista blanca de parámetros permitidos
    const ALLOWED_KEYS = [
        "RUT_COPROPIEDAD", "A_TIPO_VISITA", "autorizacion", "PLAGAS", "ASBELTO_CUBIERTA",
        "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES",
        "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION",
        "EFICIENCIA_ENERGETICA", "ACONDICIONAMIENTO", "PUNTAJE_AREA_VERDE", 
        "PUNTAJE_CIERRES", "PUNTAJE_TECHUMBRE", "PUNTAJE_ASCENSORES", "PUNTAJE_FACHADA",
        "PUNTAJE_ILUMINACION", "PUNTAJE_REDES", "PUNTAJE_ACCESIBILIDAD",
        "INTERVENCION_AREA_VERDE", "INTERVENCION_CIERRES", "INTERVENCION_TECHUMBRE",
        "INTERVENCION_ASCENSORES", "INTERVENCION_FACHADA", "INTERVENCION_ILUMINACION",
        "INTERVENCION_REDES", "INTERVENCION_ACCESIBILIDAD"
    ];

    // Hallazgo 2.1: Sanitización de entradas
    function sanitize(str) {
        if (!str) return "";
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    function getSecureParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};

        for (const key of ALLOWED_KEYS) {
            if (urlParams.has(key)) {
                let value = urlParams.get(key);
                // Formatear fecha si es timestamp largo sin punto decimal
                if (!isNaN(value) && value.length > 11 && !value.includes('.')) {
                    value = new Date(parseInt(value)).toLocaleDateString("es-CL");
                }
                params[key] = sanitize(value);
            }
        }

        // Hallazgo 2.2: Limpiar datos sensibles de la URL inmediatamente
        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        return params;
    }

    function generarListaPriorizada(attr) {
        let partidas = [
            { nombre: "A. Áreas Verdes y Equipamiento", p: attr.PUNTAJE_AREA_VERDE, intervencion: attr.INTERVENCION_AREA_VERDE },
            { nombre: "B. Cierres Perimetrales", p: attr.PUNTAJE_CIERRES, intervencion: attr.INTERVENCION_CIERRES },
            { nombre: "C. Techumbre", p: attr.PUNTAJE_TECHUMBRE, intervencion: attr.INTERVENCION_TECHUMBRE },
            { nombre: "D. Ascensores, Escaleras y/o Circulaciones", p: attr.PUNTAJE_ASCENSORES, intervencion: attr.INTERVENCION_ASCENSORES },
            { nombre: "E. Fachadas y/o Muros", p: attr.PUNTAJE_FACHADA, intervencion: attr.INTERVENCION_FACHADA },
            { nombre: "F. Sistemas de Iluminación", p: attr.PUNTAJE_ILUMINACION, intervencion: attr.INTERVENCION_ILUMINACION },
            { nombre: "G. Redes de Servicio", p: attr.PUNTAJE_REDES, intervencion: attr.INTERVENCION_REDES },
            { nombre: "K. Accesibilidad Universal", p: attr.PUNTAJE_ACCESIBILIDAD, intervencion: attr.INTERVENCION_ACCESIBILIDAD }
        ];
        partidas.sort((a, b) => parseFloat(b.p || 0) - parseFloat(a.p || 0));
        partidas.forEach(item => {
            if (!isNaN(item.p)) item.p = parseFloat(item.p).toFixed(4);
        });
        return partidas;
    }

    function procesarIncrementosSiNo(attr) {
        const incrementos = ["PLAGAS", "ASBELTO_CUBIERTA", "ASBELTO_FACHADA", "ASBELTO_LOGGIA", "ASBELTO_REDES", "RIESGO_REDES", "RIESGO_ESTRUCTURA", "RIESGO_ESCALERAS", "RIESGO_TECHUMBRE", "REGULACION", "EFICIENCIA_ENERGETICA", "ACONDICIONAMIENTO"];
        incrementos.forEach(campo => {
            attr[campo] = (attr[campo] && attr[campo].toString().toLowerCase() === "sí") ? "☑" : "☐";
        });
    }

    async function generar() {
        const status = document.getElementById("status");
        const loader = document.getElementById("loader");
        loader.style.display = "block";
        
        try {
            const attr = getSecureParams();
            if (Object.keys(attr).length === 0) {
                status.textContent = "❌ Error: Datos insuficientes o no autorizados.";
                loader.style.display = "none";
                return;
            }

            procesarIncrementosSiNo(attr);
            attr.tabla_priorizada = generarListaPriorizada(attr);

            status.textContent = "📝 Generando documento base...";
            const response = await fetch(PLANTILLA_URL);
            const content = await response.arrayBuffer();
            const zip = new window.PizZip(content);
            const doc = new window.docxtemplater(zip, {
                delimiters: { start: "[[", end: "]]" },
                paragraphLoop: true,
                linebreaks: true
            });

            doc.setData(attr);
            doc.render();

            const docxBlob = doc.getZip().generate({ type: "blob" });
            const fileName = `Ficha_DTC_${attr.RUT_COPROPIEDAD || 'Generica'}`;

            // --- CONVERSIÓN A PDF ---
            status.textContent = "🚀 Convirtiendo a PDF...";
            
            // Usando ConvertAPI (Requiere conexión permitida en CSP)
            const convertApi = window.ConvertApi.auth({ secret: CONVERT_API_SECRET });
            const params = convertApi.createParams();
            params.add('File', docxBlob, `${fileName}.docx`);
            
            const result = await convertApi.convert('docx', 'pdf', params);
            const pdfBlob = await fetch(result.files[0].Url).then(r => r.blob());

            window.saveAs(pdfBlob, `${fileName}.pdf`);

            status.textContent = "✅ ¡PDF Generado con éxito!";
            loader.style.display = "none";

        } catch (error) {
            console.error("Brecha de proceso:", error);
            status.textContent = "❌ Error: Fallo en la conversión a PDF.";
            loader.style.display = "none";
        }
    }

    window.onload = generar;
})();