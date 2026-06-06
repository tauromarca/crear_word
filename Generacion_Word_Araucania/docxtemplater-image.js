(function(global) {
    function ImageModule(options) {
        this.options = options || {};
        this.name = "ImageModule";
    }
    ImageModule.prototype.optionsTransformer = function(options, docxtemplater) {
        this.docxtemplater = docxtemplater;
        return options;
    };
    ImageModule.prototype.parse = function(type, data) {
        if (type === "tag" && data.tag.charAt(0) === "%") {
            return { type: "placeholder", value: data.tag.substr(1) };
        }
        return null;
    };
    ImageModule.prototype.render = function(part, options) {
        if (part.type !== "placeholder") return null;
        const tagValue = options.scopeManager.getValue(part.value);
        if (!tagValue) return { value: "" };

        // 1. Configuración de IDs y Nombres
        const numId = Math.floor(Math.random() * 100000);
        const rId = "rIdImg" + numId;
        // ArcGIS suele enviar JPG, pero lo forzamos a PNG internamente para máxima compatibilidad
        const imgName = "image_gis_" + numId + ".png";
        const size = this.options.getSize(null, tagValue, part.value);

        // 2. Inyectar imagen en el ZIP (IMPORTANTE: {binary: true})
        this.docxtemplater.zip.file("word/media/" + imgName, tagValue, { binary: true });

        // 3. Actualizar Content_Types.xml (Permisos de lectura)
        const ctPath = "[Content_Types].xml";
        let ctContent = this.docxtemplater.zip.file(ctPath).asText();
        if (ctContent.indexOf('Extension="png"') === -1) {
            ctContent = ctContent.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
            this.docxtemplater.zip.file(ctPath, ctContent);
        }

        // 4. Actualizar word/_rels/document.xml.rels (Relaciones)
        const relsPath = "word/_rels/document.xml.rels";
        let relsContent = this.docxtemplater.zip.file(relsPath).asText();
        const relationship = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/>`;
        relsContent = relsContent.replace("</Relationships>", relationship + "</Relationships>");
        this.docxtemplater.zip.file(relsPath, relsContent);

        // 5. XML de dibujo (OpenXML Standard)
        const cx = Math.round(size[0] * 9525);
        const cy = Math.round(size[1] * 9525);

        const xml = `
<w:run>
    <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:docPr id="${numId}" name="Img ${numId}"/>
            <wp:cNvGraphicFramePr>
                <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                        <pic:nvPicPr>
                            <pic:cNvPr id="${numId}" name="Pic ${numId}"/>
                            <pic:cNvPicPr/>
                        </pic:nvPicPr>
                        <pic:blipFill>
                            <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                            <a:stretch><a:fillRect/></a:stretch>
                        </pic:blipFill>
                        <pic:spPr>
                            <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                        </pic:spPr>
                    </pic:pic>
                </a:graphicData>
            </a:graphic>
        </wp:inline>
    </w:drawing>
</w:run>`;

        return { value: xml };
    };
    global.CustomImageModule = ImageModule;
})(window);