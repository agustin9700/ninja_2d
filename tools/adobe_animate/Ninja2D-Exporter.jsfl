// ======================================================
// Ninja 2D Runtime Exporter v3
//
// Basado en export_linked_symbols_WITH_UNITY_PIVOTS.jsfl
//
// Exporta:
//  - PNGs de símbolos con linkage
//  - pivote de registro de Animate
//  - asset_manifest.json (neutral, NO depende de Unity)
//  - escenas y timelines de simbolos con matrices locales exactas
//
// El documento fuente es de solo lectura. Los PNG se rasterizan en un
// documento temporal que se cierra sin guardar.
//
// Objetivo:
//  FLA/XFL -> PNG + pivots + transforms + timeline -> runtime 2D propio
//
// Coordenadas:
//  - Animate: Y hacia abajo
//  - Runtime: Y hacia abajo
//  - Se conserva la matriz de Animate: a,b,c,d,tx,ty
// ======================================================

(function () {
    var exportConfig = fl.ninja2DExportConfig || {};

    function notify(message) {
        if (exportConfig.quiet) {
            fl.trace(message);
        } else {
            alert(message);
        }
    }

    var sourceDom = fl.getDocumentDOM();

    if (!sourceDom) {
        notify("No hay ningún documento abierto.");
        return;
    }

    if (!sourceDom.pathURI) {
        notify("Primero debes guardar el archivo .fla o .xfl.");
        return;
    }

    var sourceLib = sourceDom.library;
    var items = sourceLib.items;
    var exportDom = null;

    if (!items || items.length === 0) {
        notify("La biblioteca está vacía.");
        return;
    }

    var TARGET_PPI = 150;
    var BASE_PPI = 72;
    var SCALE_FACTOR = TARGET_PPI / BASE_PPI;
    var MARGIN = 2;
    var MANIFEST_VERSION = "3.0";

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
            if (FLfile.exists(path)) FLfile.remove(path);
        } catch (e) {}
    }

    function clearStage() {
        try {
            exportDom.selectNone();
            exportDom.selectAll();
            exportDom.deleteSelection();
        } catch (e) {}
    }

    function ensureOneLayer() {
        try {
            var tl = exportDom.getTimeline();
            while (tl.layers.length > 1) tl.deleteLayer(1);
        } catch (e) {}
    }

    function placeLibraryItem(item) {
        exportDom.addItem({x: 0, y: 0}, item);
    }

    function getSelectionBounds() {
        try {
            var sel = exportDom.selection;
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
                left: left, top: top, right: right, bottom: bottom,
                width: right - left, height: bottom - top
            };
        } catch (e) {
            return null;
        }
    }

    function getRegistrationPoint() {
        try {
            var sel = exportDom.selection;
            if (!sel || sel.length === 0) return null;
            return {x: sel[0].x, y: sel[0].y};
        } catch (e) {
            return null;
        }
    }

    function moveSelection(dx, dy) {
        var sel = exportDom.selection;
        if (!sel) return;
        for (var i = 0; i < sel.length; i++) {
            sel[i].x += dx;
            sel[i].y += dy;
        }
    }

    function scaleSelectionPreserveRegistration(scaleX, scaleY) {
        var sel = exportDom.selection;
        if (!sel || sel.length === 0) return false;

        try {
            for (var i = 0; i < sel.length; i++) {
                sel[i].scaleX *= scaleX;
                sel[i].scaleY *= scaleY;
            }
            return true;
        } catch (e) {}

        try {
            exportDom.transformSelection(scaleX, 0, 0, scaleY);
            return true;
        } catch (e2) {}

        return false;
    }

    function num(v) {
        if (v === null || v === undefined || isNaN(v)) return 0;
        return Math.round(v * 1000000) / 1000000;
    }

    function jsonEscape(str) {
        str = String(str);
        return str.replace(/\\/g, "\\\\")
                  .replace(/"/g, "\\\"")
                  .replace(/\r/g, "\\r")
                  .replace(/\n/g, "\\n")
                  .replace(/\t/g, "\\t");
    }

    function q(str) { return "\"" + jsonEscape(str) + "\""; }


    function jsonStringify(value, indent, level) {
        indent = (indent === undefined) ? 2 : indent;
        level = (level === undefined) ? 0 : level;

        var pad = "";
        var nextPad = "";
        for (var i = 0; i < level * indent; i++) pad += " ";
        for (var j = 0; j < (level + 1) * indent; j++) nextPad += " ";

        if (value === null) return "null";

        var t = typeof value;
        if (t === "number") return num(value);
        if (t === "boolean") return value ? "true" : "false";
        if (t === "string") return q(value);

        if (value instanceof Array) {
            if (value.length === 0) return "[]";
            var arr = "[\n";
            for (var ai = 0; ai < value.length; ai++) {
                arr += nextPad + jsonStringify(value[ai], indent, level + 1);
                if (ai < value.length - 1) arr += ",";
                arr += "\n";
            }
            arr += pad + "]";
            return arr;
        }

        var out = "{";
        var first = true;
        for (var key in value) {
            if (!value.hasOwnProperty(key)) continue;
            if (first) {
                out += "\n";
                first = false;
            } else {
                out += ",\n";
            }
            out += nextPad + q(key) + ": " + jsonStringify(value[key], indent, level + 1);
        }
        if (!first) out += "\n" + pad;
        out += "}";
        return out;
    }

    function safe(obj, prop, fallback) {
        try {
            var v = obj[prop];
            return (v === undefined || v === null) ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function matrixToObject(m) {
        if (!m) return null;
        return {
            a: num(safe(m, "a", 1)),
            b: num(safe(m, "b", 0)),
            c: num(safe(m, "c", 0)),
            d: num(safe(m, "d", 1)),
            tx: num(safe(m, "tx", 0)),
            ty: num(safe(m, "ty", 0))
        };
    }

    function getElementType(el) {
        try {
            return String(el.elementType || "");
        } catch (e) {
            return "";
        }
    }

    function getLibraryName(el) {
        try {
            if (el.libraryItem) return String(el.libraryItem.name);
        } catch (e) {}
        return "";
    }

    function getLinkageForLibraryName(name) {
        if (!name) return "";
        try {
            var item = sourceLib.items;
            for (var i = 0; i < item.length; i++) {
                if (item[i].name === name) {
                    return getLinkageName(item[i]);
                }
            }
        } catch (e) {}
        return "";
    }

    function getParentLayerIndex(layer, layers) {
        var parent = safe(layer, "parentLayer", null);
        if (!parent) return null;
        for (var i = 0; i < layers.length; i++) {
            if (layers[i] === parent) return i;
        }
        return null;
    }

    function extractElement(el, timelineId, layerIndex, frameIndex, elementIndex) {
        var libraryName = getLibraryName(el);
        var transformX = safe(el, "transformX", null);
        var transformY = safe(el, "transformY", null);
        var out = {
            id: timelineId + "/layer:" + layerIndex + "/frame:" + frameIndex + "/element:" + elementIndex,
            index: elementIndex,
            elementType: getElementType(el),
            name: String(safe(el, "name", "")),
            libraryItemName: libraryName,
            linkageName: getLinkageForLibraryName(libraryName),
            matrixSpace: "ownerTimeline",
            matrix: matrixToObject(safe(el, "matrix", null)),
            x: num(safe(el, "x", 0)),
            y: num(safe(el, "y", 0)),
            width: num(safe(el, "width", 0)),
            height: num(safe(el, "height", 0)),
            rotation: num(safe(el, "rotation", 0)),
            scaleX: num(safe(el, "scaleX", 1)),
            scaleY: num(safe(el, "scaleY", 1)),
            skewX: num(safe(el, "skewX", 0)),
            skewY: num(safe(el, "skewY", 0)),
            symbolType: String(safe(el, "symbolType", "")),
            loop: String(safe(el, "loop", "")),
            firstFrame: num(safe(el, "firstFrame", 0)),
            blendMode: String(safe(el, "blendMode", "normal")),
            visible: Boolean(safe(el, "visible", true)),
            colorAlphaPercent: num(safe(el, "colorAlphaPercent", 100)),
            transformationPoint: null
        };

        if (transformX !== null && transformY !== null) {
            out.transformationPoint = {
                x: num(transformX),
                y: num(transformY),
                space: "ownerTimeline"
            };
        }

        return out;
    }

    function extractTimeline(tl, timelineId, ownerType, ownerName) {
        var result = {
            id: timelineId,
            name: String(safe(tl, "name", ownerName)),
            ownerType: ownerType,
            ownerName: ownerName,
            frameRate: num(safe(sourceDom, "frameRate", 24)),
            frameCount: num(safe(tl, "frameCount", 1)),
            currentFrame: num(safe(tl, "currentFrame", 0)),
            layerOrder: {
                arrayIndex0: "front",
                canvasRenderOrder: "descendingLayerIndex"
            },
            layers: []
        };

        var layers = tl.layers || [];

        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            var layerOut = {
                index: li,
                name: String(safe(layer, "name", "Layer " + (li + 1))),
                layerType: String(safe(layer, "layerType", "")),
                parentLayerIndex: getParentLayerIndex(layer, layers),
                visible: Boolean(safe(layer, "visible", true)),
                locked: Boolean(safe(layer, "locked", false)),
                outline: Boolean(safe(layer, "outline", false)),
                frames: []
            };

            var frames = layer.frames || [];
            for (var fi = 0; fi < frames.length; fi++) {
                var frame = frames[fi];
                var frameIndex = num(safe(frame, "startFrame", safe(frame, "index", fi)));

                // JSFL repite el mismo keyframe para cada frame de su duracion.
                if (frameIndex !== fi) continue;

                var frameOut = {
                    index: frameIndex,
                    duration: num(safe(frame, "duration", 1)),
                    name: String(safe(frame, "name", "")),
                    labelType: String(safe(frame, "labelType", "")),
                    tweenType: String(safe(frame, "tweenType", "none")),
                    tweenEasing: num(safe(frame, "tweenEasing", 0)),
                    actionScript: String(safe(frame, "actionScript", "")),
                    elements: []
                };

                var elems = frame.elements || [];
                for (var ei = 0; ei < elems.length; ei++) {
                    frameOut.elements.push(extractElement(elems[ei], timelineId, li, frameIndex, ei));
                }

                layerOut.frames.push(frameOut);
            }

            result.layers.push(layerOut);
        }

        return result;
    }

    function extractDocumentTimelines() {
        var out = [];
        var timelines = safe(sourceDom, "timelines", null);

        if (!timelines || timelines.length === 0) {
            timelines = [sourceDom.getTimeline()];
        }

        for (var i = 0; i < timelines.length; i++) {
            out.push(extractTimeline(timelines[i], "scene:" + i, "document", String(safe(timelines[i], "name", "Scene " + (i + 1)))));
        }
        return out;
    }

    function extractSymbolTimelines() {
        var out = [];
        for (var i = 0; i < items.length; i++) {
            if (!isSymbol(items[i])) continue;
            var tl = safe(items[i], "timeline", null);
            if (!tl) continue;
            out.push(extractTimeline(tl, "library:" + String(items[i].name), "librarySymbol", String(items[i].name)));
        }
        return out;
    }

    var docInfo = getDocumentInfoFromURI(sourceDom.pathURI);
    var outputBaseName = exportConfig.outputName || replaceSetPrefixWithClothing(docInfo.baseName);
    var outputFolder = exportConfig.outputFolderURI || (docInfo.parentFolder + "/" + outputBaseName);
    FLfile.createFolder(outputFolder);

    var exported = 0, skipped = 0, errors = 0;
    var errorRecords = [];
    var pivotRecords = [];
    var symbolRecords = [];

    // Toda esta metadata se captura antes de abrir el documento temporal.
    var documentTimelines = extractDocumentTimelines();
    var symbolTimelines = extractSymbolTimelines();

    // Biblioteca: metadata neutral.
    for (var bi = 0; bi < items.length; bi++) {
        var bitem = items[bi];
        if (!isSymbol(bitem)) continue;

        var linkage = getLinkageName(bitem);
        symbolRecords.push({
            libraryName: String(bitem.name),
            itemType: String(bitem.itemType),
            linkageName: linkage,
            timelineId: safe(bitem, "timeline", null) ? "library:" + String(bitem.name) : null
        });
    }

    exportDom = fl.createDocument();
    if (!exportDom) {
        notify("No se pudo crear el documento temporal de exportacion.");
        return;
    }
    ensureOneLayer();
    clearStage();

    try {
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
            placeLibraryItem(item);

            if (!exportDom.selection || exportDom.selection.length === 0) {
                throw new Error("No se pudo colocar el símbolo.");
            }

            var boundsBeforeScale = getSelectionBounds();
            if (!boundsBeforeScale || boundsBeforeScale.width <= 0 || boundsBeforeScale.height <= 0) {
                throw new Error("Bounds inválidos.");
            }

            if (!scaleSelectionPreserveRegistration(SCALE_FACTOR, SCALE_FACTOR)) {
                throw new Error("No se pudo escalar.");
            }

            var boundsAfterScale = getSelectionBounds();
            if (!boundsAfterScale || boundsAfterScale.width <= 0 || boundsAfterScale.height <= 0) {
                throw new Error("Bounds inválidos después de escalar.");
            }

            var canvasLeft = Math.min(boundsAfterScale.left, 0);
            var canvasTop = Math.min(boundsAfterScale.top, 0);
            var canvasRight = Math.max(boundsAfterScale.right, 0);
            var canvasBottom = Math.max(boundsAfterScale.bottom, 0);

            moveSelection(MARGIN - canvasLeft, MARGIN - canvasTop);

            var boundsFinal = getSelectionBounds();
            var registrationPx = getRegistrationPoint();
            if (!registrationPx) throw new Error("No se pudo leer registro.");

            var exportWidth = Math.ceil((canvasRight - canvasLeft) + (MARGIN * 2));
            var exportHeight = Math.ceil((canvasBottom - canvasTop) + (MARGIN * 2));

            if (boundsFinal.right + MARGIN > exportWidth) exportWidth = Math.ceil(boundsFinal.right + MARGIN);
            if (boundsFinal.bottom + MARGIN > exportHeight) exportHeight = Math.ceil(boundsFinal.bottom + MARGIN);
            if (registrationPx.x + MARGIN > exportWidth) exportWidth = Math.ceil(registrationPx.x + MARGIN);
            if (registrationPx.y + MARGIN > exportHeight) exportHeight = Math.ceil(registrationPx.y + MARGIN);

            exportDom.width = exportWidth;
            exportDom.height = exportHeight;

            var neutralPivot = {
                x: registrationPx.x,
                y: registrationPx.y,
                normalizedX: registrationPx.x / exportWidth,
                normalizedYTop: registrationPx.y / exportHeight,
                normalizedYUp: 1 - (registrationPx.y / exportHeight)
            };

            var dst = outputFolder + "/" + exportName + ".png";
            removeIfExists(dst);

            var ok = true;
            try {
                ok = exportDom.exportPNG(dst, true, true);
            } catch (e1) {
                ok = exportDom.exportPNG(dst);
            }

            if (ok === false) throw new Error("exportPNG devolvió false.");

            pivotRecords.push({
                partName: exportName,
                png: exportName + ".png",
                symbolName: String(item.name),
                linkageName: exportName,
                scaleFactor: SCALE_FACTOR,
                margin: MARGIN,
                exportWidth: exportWidth,
                exportHeight: exportHeight,
                rasterPixelsPerSourceUnit: SCALE_FACTOR,
                registrationSource: {x: 0, y: 0},
                registrationPx: {x: num(registrationPx.x), y: num(registrationPx.y)},
                pivot: neutralPivot,
                boundsBeforeScale: boundsBeforeScale,
                boundsAfterScale: boundsAfterScale,
                boundsFinal: boundsFinal
            });

            exported++;
            fl.trace("Exportado: " + dst);

        } catch (err) {
            errors++;
            errorRecords.push({
                partName: exportName,
                symbolName: String(item.name),
                message: String(err)
            });
            fl.trace("Error exportando '" + exportName + "': " + err);
        }
    }
    } finally {
        try {
            clearStage();
            fl.closeDocument(exportDom, false);
        } catch (closeError) {
            fl.trace("No se pudo cerrar el documento temporal: " + closeError);
        }
        exportDom = null;
    }

    var defaultTimelineIndex = num(safe(sourceDom, "currentTimeline", 0));
    if (defaultTimelineIndex < 0 || defaultTimelineIndex >= documentTimelines.length) {
        defaultTimelineIndex = 0;
    }
    var defaultTimeline = documentTimelines.length > 0 ? documentTimelines[defaultTimelineIndex] : null;

    var manifest = {
        manifestVersion: MANIFEST_VERSION,
        generator: "Ninja 2D Runtime Exporter v3",
        sourceDocument: docInfo.fileName,
        outputName: outputBaseName,
        source: {
            document: {
                name: docInfo.fileName,
                width: num(safe(sourceDom, "width", 0)),
                height: num(safe(sourceDom, "height", 0)),
                backgroundColor: String(safe(sourceDom, "backgroundColor", "")),
                frameRate: num(safe(sourceDom, "frameRate", 24))
            },
            defaultTimelineId: defaultTimeline ? defaultTimeline.id : null,
            documentTimelines: documentTimelines,
            symbolTimelines: symbolTimelines
        },
        coordinateSystem: {
            sourceUnits: "Animate document pixels at basePpi",
            xAxis: "right",
            yAxis: "down",
            angles: "degrees clockwise in screen coordinates",
            matrixConvention: "columnVector",
            matrixEquation: "x' = a*x + c*y + tx; y' = b*x + d*y + ty",
            rasterPixelsPerSourceUnit: SCALE_FACTOR
        },
        rendering: {
            layerIndex0: "front",
            canvasLayerIteration: "descending",
            authoritativeTransform: "element.matrix",
            rasterCompensation: "draw PNG at 1 / rasterPixelsPerSourceUnit in symbol-local space"
        },
        hierarchy: {
            model: "timeline-instance nesting",
            note: "A symbol instance is parented by the timeline that owns it. No anatomical bone parent is inferred from layer names or proximity."
        },
        raster: {
            targetPpi: TARGET_PPI,
            basePpi: BASE_PPI,
            scaleFactor: SCALE_FACTOR,
            margin: MARGIN
        },
        stats: {
            exported: exported,
            skipped: skipped,
            errors: errors,
            errorDetails: errorRecords
        },
        symbols: symbolRecords,
        parts: pivotRecords,
        timeline: defaultTimeline
    };

    var manifestPath = outputFolder + "/asset_manifest.json";
    FLfile.write(manifestPath, jsonStringify(manifest, 2, 0));

    // Mantener archivo compatible con el exportador anterior.
    var legacy = {
        generator: "export_linked_symbols_WITH_UNITY_PIVOTS.jsfl",
        sourceDocument: docInfo.fileName,
        outputName: outputBaseName,
        targetPpi: TARGET_PPI,
        basePpi: BASE_PPI,
        scaleFactor: SCALE_FACTOR,
        margin: MARGIN,
        stats: {exported: exported, skipped: skipped, errors: errors, errorDetails: errorRecords},
        parts: {}
    };

    for (var pi = 0; pi < pivotRecords.length; pi++) {
        var r = pivotRecords[pi];
        legacy.parts[r.partName] = {
            partName: r.partName,
            png: r.png,
            symbolName: r.symbolName,
            linkageName: r.linkageName,
            scaleFactor: r.scaleFactor,
            margin: r.margin,
            exportWidth: r.exportWidth,
            exportHeight: r.exportHeight,
            registrationPx: r.registrationPx,
            unityPivot: {
                x: r.pivot.normalizedX,
                y: r.pivot.normalizedYUp
            },
            boundsBeforeScale: r.boundsBeforeScale,
            boundsAfterScale: r.boundsAfterScale,
            boundsFinal: r.boundsFinal
        };
    }

    FLfile.write(outputFolder + "/_unity_pivots.json", jsonStringify(legacy, 2, 0));

    notify(
        "Exportación v3 finalizada.\n\n" +
        "Documento: " + docInfo.fileName + "\n" +
        "Salida: " + outputFolder + "\n" +
        "asset_manifest.json: OK\n" +
        "_unity_pivots.json: OK\n" +
        "Exportados: " + exported + "\n" +
        "Omitidos: " + skipped + "\n" +
        "Errores: " + errors + "\n" +
        "Documento fuente modificado: NO"
    );
})();
