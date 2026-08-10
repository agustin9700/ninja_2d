// ======================================================
// Exportar símbolos linked a PNG + pivotes para Unity
//
// - Acepta documento .fla o .xfl abierto en Adobe Animate
// - Exporta usando el nombre exacto del linkage
// - Carpeta de salida = nombre del documento, cambiando SOLO prefijo set_ por clothing_
//      set_835_0.fla  -> clothing_835_0
//      set_835_0.xfl  -> clothing_835_0
// - Exporta PNG equivalente a 150 ppp
// - Además genera: _unity_pivots.json
//
// Uso esperado en Unity:
// - Cada PNG se importa como Sprite con pivot Custom.
// - CreateClothingPrefab debe leer _unity_pivots.json y aplicar unityPivot.x/y.
//
// Adobe Animate - JSFL
// ======================================================

(function () {
    var dom = fl.getDocumentDOM();

    if (!dom) {
        alert("No hay ningún documento abierto.");
        return;
    }

    if (!dom.pathURI) {
        alert("Primero debes guardar el archivo .fla o .xfl.");
        return;
    }

    var lib = dom.library;
    var items = lib.items;

    if (!items || items.length === 0) {
        alert("La biblioteca está vacía.");
        return;
    }

    var TARGET_PPI = 150;
    var BASE_PPI = 72;
    var SCALE_FACTOR = TARGET_PPI / BASE_PPI; // 2.083333...
    var MARGIN = 2;

    function sanitizeFileName(name) {
        return String(name).replace(/[\\\/:*?"<>|]/g, "_");
    }

    function stripTrailingSlash(uri) {
        while (uri.length > 0 && uri.charAt(uri.length - 1) === "/") {
            uri = uri.substring(0, uri.length - 1);
        }
        return uri;
    }

    function getDocumentInfoFromURI(uri) {
        uri = stripTrailingSlash(uri);

        var lastSlash = uri.lastIndexOf("/");
        var fileName = (lastSlash >= 0) ? uri.substring(lastSlash + 1) : uri;
        var parentFolder = (lastSlash >= 0) ? uri.substring(0, lastSlash) : "";

        // En algunos XFL, Animate puede reportar el path como .../carpeta/DOMDocument.xml.
        // En ese caso usamos el nombre de la carpeta XFL como nombre base del documento.
        if (fileName.toLowerCase() === "domdocument.xml") {
            var xflFolderURI = parentFolder;
            var slash2 = xflFolderURI.lastIndexOf("/");
            fileName = (slash2 >= 0) ? xflFolderURI.substring(slash2 + 1) : xflFolderURI;
            parentFolder = (slash2 >= 0) ? xflFolderURI.substring(0, slash2) : "";
        }

        var dot = fileName.lastIndexOf(".");
        var baseName = (dot >= 0) ? fileName.substring(0, dot) : fileName;

        return {
            parentFolder: parentFolder,
            fileName: fileName,
            baseName: baseName
        };
    }

    function replaceSetPrefixWithClothing(baseName) {
        baseName = sanitizeFileName(baseName);

        var lower = baseName.toLowerCase();

        if (lower.indexOf("set_") === 0) {
            return "clothing_" + baseName.substring(4);
        }

        if (lower.indexOf("clothing_") === 0) {
            return baseName;
        }

        return "clothing_" + baseName;
    }

    function isSymbol(item) {
        return item.itemType === "movie clip" ||
               item.itemType === "graphic" ||
               item.itemType === "button";
    }

    function getLinkageName(item) {
        try {
            if (item.linkageClassName && item.linkageClassName !== "") {
                return item.linkageClassName;
            }
        } catch (e) {}

        try {
            if (item.linkageIdentifier && item.linkageIdentifier !== "") {
                return item.linkageIdentifier;
            }
        } catch (e2) {}

        return "";
    }

    function removeIfExists(path) {
        try {
            if (FLfile.exists(path)) {
                FLfile.remove(path);
            }
        } catch (e) {}
    }

    function clearStage() {
        try {
            dom.selectNone();
            dom.selectAll();
            dom.deleteSelection();
        } catch (e) {}
    }

    function ensureOneLayer() {
        try {
            var tl = dom.getTimeline();
            while (tl.layers.length > 1) {
                tl.deleteLayer(1);
            }
        } catch (e) {}
    }

    function placeLibraryItem(itemName) {
        lib.selectNone();
        lib.selectItem(itemName);
        lib.addItemToDocument({x: 0, y: 0});
    }

    function getSelectionBounds() {
        try {
            var sel = dom.selection;
            if (!sel || sel.length === 0) return null;

            var left = sel[0].left;
            var top = sel[0].top;
            var right = sel[0].left + sel[0].width;
            var bottom = sel[0].top + sel[0].height;

            for (var i = 1; i < sel.length; i++) {
                var el = sel[i];
                if (el.left < left) left = el.left;
                if (el.top < top) top = el.top;
                if (el.left + el.width > right) right = el.left + el.width;
                if (el.top + el.height > bottom) bottom = el.top + el.height;
            }

            return {
                left: left,
                top: top,
                right: right,
                bottom: bottom,
                width: right - left,
                height: bottom - top
            };
        } catch (e) {
            return null;
        }
    }

    function getRegistrationPoint() {
        try {
            var sel = dom.selection;
            if (!sel || sel.length === 0) return null;

            // Para SymbolInstance, x/y representan el punto de registro colocado en el stage.
            return {
                x: sel[0].x,
                y: sel[0].y
            };
        } catch (e) {
            return null;
        }
    }

    function moveSelection(dx, dy) {
        var sel = dom.selection;
        if (!sel) return;
        for (var i = 0; i < sel.length; i++) {
            sel[i].x += dx;
            sel[i].y += dy;
        }
    }

    function scaleSelectionPreserveRegistration(scaleX, scaleY) {
        var sel = dom.selection;
        if (!sel || sel.length === 0) return false;

        // Importante: escalar tocando scaleX/scaleY preserva el registro x/y del símbolo.
        // Esto es mejor para calcular el pivot de Unity.
        try {
            for (var i = 0; i < sel.length; i++) {
                sel[i].scaleX *= scaleX;
                sel[i].scaleY *= scaleY;
            }
            return true;
        } catch (e) {}

        // Fallback por compatibilidad.
        try {
            dom.transformSelection(scaleX, 0, 0, scaleY);
            return true;
        } catch (e2) {}

        return false;
    }

    function num(v) {
        if (v === null || v === undefined || isNaN(v)) return "0";
        return String(Math.round(v * 1000000) / 1000000);
    }

    function jsonEscape(str) {
        str = String(str);
        str = str.replace(/\\/g, "\\\\");
        str = str.replace(/"/g, "\\\"");
        str = str.replace(/\r/g, "\\r");
        str = str.replace(/\n/g, "\\n");
        str = str.replace(/\t/g, "\\t");
        return str;
    }

    function q(str) {
        return "\"" + jsonEscape(str) + "\"";
    }

    function rectJson(r) {
        if (!r) return "null";
        return "{\n" +
            "      \"left\": " + num(r.left) + ",\n" +
            "      \"top\": " + num(r.top) + ",\n" +
            "      \"right\": " + num(r.right) + ",\n" +
            "      \"bottom\": " + num(r.bottom) + ",\n" +
            "      \"width\": " + num(r.width) + ",\n" +
            "      \"height\": " + num(r.height) + "\n" +
            "    }";
    }

    function pointJson(p) {
        if (!p) return "null";
        return "{ \"x\": " + num(p.x) + ", \"y\": " + num(p.y) + " }";
    }

    function recordJson(r, isLast) {
        var s = "    " + q(r.partName) + ": {\n" +
            "      \"partName\": " + q(r.partName) + ",\n" +
            "      \"png\": " + q(r.png) + ",\n" +
            "      \"symbolName\": " + q(r.symbolName) + ",\n" +
            "      \"linkageName\": " + q(r.linkageName) + ",\n" +
            "      \"scaleFactor\": " + num(r.scaleFactor) + ",\n" +
            "      \"margin\": " + num(r.margin) + ",\n" +
            "      \"exportWidth\": " + num(r.exportWidth) + ",\n" +
            "      \"exportHeight\": " + num(r.exportHeight) + ",\n" +
            "      \"registrationPx\": " + pointJson(r.registrationPx) + ",\n" +
            "      \"unityPivot\": " + pointJson(r.unityPivot) + ",\n" +
            "      \"boundsBeforeScale\": " + rectJson(r.boundsBeforeScale) + ",\n" +
            "      \"boundsAfterScale\": " + rectJson(r.boundsAfterScale) + ",\n" +
            "      \"boundsFinal\": " + rectJson(r.boundsFinal) + "\n" +
            "    }";
        if (!isLast) s += ",";
        return s;
    }

    function writePivotJson(path, docInfo, outputBaseName, records, exported, skipped, errors) {
        var s = "{\n" +
            "  \"generator\": \"export_linked_symbols_WITH_UNITY_PIVOTS.jsfl\",\n" +
            "  \"sourceDocument\": " + q(docInfo.fileName) + ",\n" +
            "  \"outputName\": " + q(outputBaseName) + ",\n" +
            "  \"targetPpi\": " + num(TARGET_PPI) + ",\n" +
            "  \"basePpi\": " + num(BASE_PPI) + ",\n" +
            "  \"scaleFactor\": " + num(SCALE_FACTOR) + ",\n" +
            "  \"margin\": " + num(MARGIN) + ",\n" +
            "  \"note\": \"unityPivot usa coordenadas normalizadas de Unity. registrationPx es el punto de registro de Animate dentro del PNG exportado.\",\n" +
            "  \"stats\": {\n" +
            "    \"exported\": " + exported + ",\n" +
            "    \"skipped\": " + skipped + ",\n" +
            "    \"errors\": " + errors + "\n" +
            "  },\n" +
            "  \"parts\": {\n";

        for (var i = 0; i < records.length; i++) {
            s += recordJson(records[i], i === records.length - 1) + "\n";
        }

        s += "  }\n" + "}\n";
        FLfile.write(path, s);
    }

    var docInfo = getDocumentInfoFromURI(dom.pathURI);
    var outputBaseName = replaceSetPrefixWithClothing(docInfo.baseName);
    var outputFolder = docInfo.parentFolder + "/" + outputBaseName;
    FLfile.createFolder(outputFolder);

    var exported = 0;
    var skipped = 0;
    var errors = 0;
    var pivotRecords = [];

    var originalWidth = dom.width;
    var originalHeight = dom.height;
    var originalBg = dom.backgroundColor;

    ensureOneLayer();
    clearStage();

    for (var i = 0; i < items.length; i++) {
        var item = items[i];

        if (!isSymbol(item)) {
            skipped++;
            continue;
        }

        var exportName = getLinkageName(item);
        if (!exportName) {
            skipped++;
            continue;
        }

        exportName = sanitizeFileName(exportName);

        try {
            clearStage();
            placeLibraryItem(item.name);

            if (!dom.selection || dom.selection.length === 0) {
                throw new Error("No se pudo colocar el símbolo en el stage.");
            }

            // Al colocar en {x:0,y:0}, el registro del símbolo queda en el origen del stage.
            var boundsBeforeScale = getSelectionBounds();
            if (!boundsBeforeScale || boundsBeforeScale.width <= 0 || boundsBeforeScale.height <= 0) {
                throw new Error("No se pudo obtener el tamaño del símbolo.");
            }

            if (!scaleSelectionPreserveRegistration(SCALE_FACTOR, SCALE_FACTOR)) {
                throw new Error("No se pudo escalar la selección.");
            }

            var boundsAfterScale = getSelectionBounds();
            if (!boundsAfterScale || boundsAfterScale.width <= 0 || boundsAfterScale.height <= 0) {
                throw new Error("No se pudieron recalcular los bounds luego de escalar.");
            }

            // El canvas debe incluir tanto la imagen como el punto de registro (0,0).
            // Esto evita pivotes fuera del PNG cuando el registro cae fuera del arte visible.
            var canvasLeft = Math.min(boundsAfterScale.left, 0);
            var canvasTop = Math.min(boundsAfterScale.top, 0);
            var canvasRight = Math.max(boundsAfterScale.right, 0);
            var canvasBottom = Math.max(boundsAfterScale.bottom, 0);

            // Mover para dejar canvasLeft/canvasTop con margen.
            moveSelection(MARGIN - canvasLeft, MARGIN - canvasTop);

            var boundsFinal = getSelectionBounds();
            var registrationPx = getRegistrationPoint();
            if (!registrationPx) {
                throw new Error("No se pudo leer el punto de registro final.");
            }

            var exportWidth = Math.ceil((canvasRight - canvasLeft) + (MARGIN * 2));
            var exportHeight = Math.ceil((canvasBottom - canvasTop) + (MARGIN * 2));

            // Seguridad: si por algún motivo los bounds finales exceden, expandir stage.
            if (boundsFinal.right + MARGIN > exportWidth) exportWidth = Math.ceil(boundsFinal.right + MARGIN);
            if (boundsFinal.bottom + MARGIN > exportHeight) exportHeight = Math.ceil(boundsFinal.bottom + MARGIN);
            if (registrationPx.x + MARGIN > exportWidth) exportWidth = Math.ceil(registrationPx.x + MARGIN);
            if (registrationPx.y + MARGIN > exportHeight) exportHeight = Math.ceil(registrationPx.y + MARGIN);

            dom.width = exportWidth;
            dom.height = exportHeight;

            var unityPivot = {
                x: registrationPx.x / exportWidth,
                y: 1 - (registrationPx.y / exportHeight)
            };

            var dst = outputFolder + "/" + exportName + ".png";
            removeIfExists(dst);

            var ok = true;
            try {
                ok = dom.exportPNG(dst, true, true);
            } catch (e1) {
                try {
                    ok = dom.exportPNG(dst);
                } catch (e2) {
                    throw new Error("exportPNG no funcionó en esta versión de Animate.");
                }
            }

            if (ok === false) {
                throw new Error("exportPNG devolvió false.");
            }

            pivotRecords.push({
                partName: exportName,
                png: exportName + ".png",
                symbolName: item.name,
                linkageName: exportName,
                scaleFactor: SCALE_FACTOR,
                margin: MARGIN,
                exportWidth: exportWidth,
                exportHeight: exportHeight,
                registrationPx: registrationPx,
                unityPivot: unityPivot,
                boundsBeforeScale: boundsBeforeScale,
                boundsAfterScale: boundsAfterScale,
                boundsFinal: boundsFinal
            });

            exported++;
            fl.trace("Exportado: " + dst + " | unityPivot=(" + num(unityPivot.x) + ", " + num(unityPivot.y) + ")");

        } catch (err) {
            errors++;
            fl.trace("Error exportando '" + exportName + "': " + err);
        }
    }

    var pivotJsonPath = outputFolder + "/_unity_pivots.json";
    try {
        writePivotJson(pivotJsonPath, docInfo, outputBaseName, pivotRecords, exported, skipped, errors);
        fl.trace("Pivotes Unity guardados: " + pivotJsonPath);
    } catch (jsonErr) {
        errors++;
        fl.trace("Error escribiendo _unity_pivots.json: " + jsonErr);
    }

    try {
        clearStage();
        dom.width = originalWidth;
        dom.height = originalHeight;
        dom.backgroundColor = originalBg;
    } catch (e) {}

    alert(
        "Exportación finalizada.\n\n" +
        "Documento: " + docInfo.fileName + "\n" +
        "Carpeta creada: " + outputFolder + "\n" +
        "Nombre final esperado: " + outputBaseName + "\n" +
        "Escala aplicada: " + SCALE_FACTOR + "x (equiv. 150 ppp)\n" +
        "Archivo de pivotes: _unity_pivots.json\n" +
        "Exportados: " + exported + "\n" +
        "Omitidos: " + skipped + "\n" +
        "Errores: " + errors
    );
})();
