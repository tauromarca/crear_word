/* Módulo de Imagen para Docxtemplater - Versión Navegador */
(function(global) {
    function ImageModule(options) {
        this.options = options || {};
        this.name = "ImageModule";
    }
    ImageModule.prototype.handle = function(type, data) {
        if (type === "get" && data === "image") { return this.options.getImage; }
        return null;
    };
    ImageModule.prototype.optionsTransformer = function(options, docxtemplater) {
        this.docxtemplater = docxtemplater;
        return options;
    };
    ImageModule.prototype.set = function(obj) {
        if (obj.inspect) { this.inspect = obj.inspect; }
    };
    ImageModule.prototype.parse = function(type, data) {
        if (type === "tag" && data?.tag?.[0] === "%") {
            return { type: "placeholder", value: data.tag.substr(1) };
        }
        return null;
    };
    ImageModule.prototype.render = function(part, options) {
        if (part.type !== "placeholder") { return null; }
        const tagValue = options.scopeManager.getValue(part.value);
        if (!tagValue) { return { errors: [] }; }
        const imgBuffer = this.options.getImage(tagValue, part.value);
        const size = this.options.getSize(imgBuffer, tagValue, part.value);
        const rId = this.docxtemplater.zip.generateNextId();
        this.docxtemplater.zip.file(`word/media/image${rId}.png`, imgBuffer);
        // XML necesario para insertar la imagen en el Word
        const xml = `<w:drawing><wp:inline><wp:extent cx="${size[0] * 9525}" cy="${size[1] * 9525}"/><wp:docPr id="${rId}" name="Image ${rId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${rId}" name="Image ${rId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size[0] * 9525}" cy="${size[1] * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
        return { value: xml };
    };
    global.ImageModule = ImageModule;
})(window);