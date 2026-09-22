import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  LAYER_ORDER,
  buildScene,
  createCase,
  sceneToPdfBytes,
  sceneToSvg,
  serializeCase,
} from './geometry.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = path.join(ROOT, 'illustrator-native');
export const JSX_PATH = path.join(OUTPUT_DIR, 'XIECHENG_A1_NATIVE_ROUNDTRIP.jsx');
export const REPORT_PATH = path.join(OUTPUT_DIR, 'roundtrip-report.json');
export const EXPECTED_PATH = path.join(OUTPUT_DIR, 'canonical-scenes.json');
export const TOLERANCE_MM = 0.01;

export const NATIVE_CASES = Object.freeze([
  {
    id: 'CASE_01',
    caseData: createCase({ caseCode: 'XC-AI-CASE01', revision: 1, nominal: { L: 300, W: 180, H: 200 } }),
  },
  {
    id: 'CASE_02',
    caseData: createCase({ caseCode: 'XC-AI-CASE02', revision: 1, nominal: { L: 450, W: 300, H: 300 } }),
  },
  {
    id: 'CASE_03',
    caseData: createCase({
      caseCode: 'XC-AI-CASE03',
      revision: 1,
      nominal: { L: 200, W: 180, H: 200 },
      layout: { L: 200, W: 182, H: 200 },
      layoutOverride: true,
    }),
  },
]);

const AI_LAYER_NAMES = Object.freeze({
  ARTWORK: '01_ARTWORK',
  REFERENCE_OUTLINE: '02_REFERENCE_OUTLINE',
  CREASE_REFERENCE: '03_CREASE_REFERENCE',
  SLOT_CUT_REFERENCE: '04_SLOT_CUT_REFERENCE',
  GLUE_TAB: '05_GLUE_TAB',
  DIMENSIONS: '06_DIMENSIONS',
  FACE_IDS: '07_FACE_IDS',
  NOTES: '08_NOTES',
});

const AI_LAYER_ORDER = Object.freeze([
  '01_ARTWORK',
  '02_REFERENCE_OUTLINE',
  '03_CREASE_REFERENCE',
  '04_SLOT_CUT_REFERENCE',
  '05_GLUE_TAB',
  '06_DIMENSIONS',
  '07_FACE_IDS',
  '08_NOTES',
]);

function outputBase(caseData) {
  const revision = String(caseData.revision).padStart(3, '0');
  const size = ({ L, W, H }) => `${L}x${W}x${H}`;
  const dimensions = caseData.layoutOverride
    ? `N${size(caseData.nominal)}_P${size(caseData.layout)}`
    : size(caseData.nominal);
  return `${caseData.caseCode}_R${revision}_A1_${dimensions}_ARTWORK_TEMPLATE`;
}

function preparePayload() {
  return NATIVE_CASES.map(({ id, caseData }) => {
    const scene = buildScene(caseData);
    return {
      id,
      fileBase: outputBase(caseData),
      outputPath: path.join(OUTPUT_DIR, `${outputBase(caseData)}.ai`).replaceAll('\\', '/'),
      caseData,
      serializedCase: serializeCase(caseData),
      scene,
      aiLayerNames: AI_LAYER_NAMES,
    };
  });
}

function buildJsx(payload) {
  const reportPath = REPORT_PATH.replaceAll('\\', '/');
  return `#target illustrator
(function () {
  var PT_PER_MM = 72 / 25.4;
  var CASES = ${JSON.stringify(payload)};
  var REPORT_PATH = ${JSON.stringify(reportPath)};
  var REQUIRED_LAYERS = ${JSON.stringify(AI_LAYER_ORDER)};
  var report = { schema: 'xiecheng.a1.illustrator-roundtrip.v1', illustratorVersion: String(app.version), cases: [] };
  var previousInteractionLevel = app.userInteractionLevel;

  function mm(value) { return value * PT_PER_MM; }
  function ptToMm(value) { return value / PT_PER_MM; }
  function rounded(value) { return Math.round(value * 1000000) / 1000000; }
  function colorFromHex(hex) {
    var normalized = hex.substring(1);
    var r = parseInt(normalized.substring(0, 2), 16) / 255;
    var g = parseInt(normalized.substring(2, 4), 16) / 255;
    var b = parseInt(normalized.substring(4, 6), 16) / 255;
    var k = 1 - Math.max(r, g, b);
    var result = new CMYKColor();
    if (k >= 0.999999) {
      result.cyan = 0; result.magenta = 0; result.yellow = 0; result.black = 100;
    } else {
      result.cyan = ((1 - r - k) / (1 - k)) * 100;
      result.magenta = ((1 - g - k) / (1 - k)) * 100;
      result.yellow = ((1 - b - k) / (1 - k)) * 100;
      result.black = k * 100;
    }
    return result;
  }
  function createLayers(doc) {
    var layerMap = {};
    doc.layers[0].name = REQUIRED_LAYERS[REQUIRED_LAYERS.length - 1];
    layerMap[doc.layers[0].name] = doc.layers[0];
    for (var i = REQUIRED_LAYERS.length - 2; i >= 0; i -= 1) {
      var layer = doc.layers.add();
      layer.name = REQUIRED_LAYERS[i];
      layerMap[layer.name] = layer;
    }
    return layerMap;
  }
  function addSegment(layer, item, style, name) {
    var pathItem = layer.pathItems.add();
    pathItem.name = name;
    pathItem.setEntirePath([[mm(item.x1), -mm(item.y1)], [mm(item.x2), -mm(item.y2)]]);
    pathItem.filled = false;
    pathItem.stroked = true;
    pathItem.strokeWidth = mm(style.width || 0.25);
    pathItem.strokeColor = colorFromHex(style.stroke || '#111827');
    if (style.dash && style.dash.length) {
      var dash = [];
      for (var i = 0; i < style.dash.length; i += 1) dash.push(mm(style.dash[i]));
      pathItem.strokeDashes = dash;
    }
  }
  function addText(layer, item, style, name) {
    var textFrame = layer.textFrames.pointText([mm(item.x), -mm(item.y)]);
    textFrame.name = name;
    textFrame.contents = item.value;
    textFrame.textRange.characterAttributes.size = mm(item.fontSize || style.fontSize || 4);
    textFrame.textRange.characterAttributes.fillColor = colorFromHex(style.fill || '#34443d');
    if (item.anchor === 'middle') textFrame.textRange.paragraphAttributes.justification = Justification.CENTER;
  }
  function quoteJson(value) {
    var source = String(value);
    var slash = String.fromCharCode(92);
    var result = '"';
    for (var characterIndex = 0; characterIndex < source.length; characterIndex += 1) {
      var character = source.charAt(characterIndex);
      var code = source.charCodeAt(characterIndex);
      if (code === 34) result += slash + '"';
      else if (code === 92) result += slash + slash;
      else if (code === 13) result += slash + 'r';
      else if (code === 10) result += slash + 'n';
      else if (code === 9) result += slash + 't';
      else result += character;
    }
    return result + '"';
  }
  function stringifyJson(value, depth) {
    if (value === null || typeof value === 'undefined') return 'null';
    if (typeof value === 'string') return quoteJson(value);
    if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    var indent = '';
    var childIndent = '';
    for (var pad = 0; pad < depth; pad += 1) indent += '  ';
    childIndent = indent + '  ';
    var parts = [];
    if (value instanceof Array) {
      for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex += 1) {
        parts.push(childIndent + stringifyJson(value[arrayIndex], depth + 1));
      }
      return parts.length ? '[\\n' + parts.join(',\\n') + '\\n' + indent + ']' : '[]';
    }
    for (var key in value) {
      if (value.hasOwnProperty(key)) parts.push(childIndent + quoteJson(key) + ': ' + stringifyJson(value[key], depth + 1));
    }
    return parts.length ? '{\\n' + parts.join(',\\n') + '\\n' + indent + '}' : '{}';
  }
  function writeJson(filePath, value) {
    var file = new File(filePath);
    file.encoding = 'UTF-8';
    if (!file.open('w')) throw new Error('Unable to open report file: ' + filePath);
    file.write(stringifyJson(value, 0));
    file.close();
  }
  function inspectDocument(doc, caseSpec, rasterEffectsSet) {
    var artboardRect = doc.artboards[0].artboardRect;
    var result = {
      id: caseSpec.id,
      filePath: caseSpec.outputPath,
      documentColorSpace: doc.documentColorSpace === DocumentColorSpace.CMYK ? 'CMYK' : String(doc.documentColorSpace),
      cmykDocument: doc.documentColorSpace === DocumentColorSpace.CMYK,
      rulerUnits: String(doc.rulerUnits),
      rasterEffectsPpi: doc.rasterEffectSettings && doc.rasterEffectSettings.resolution ? Number(doc.rasterEffectSettings.resolution) : null,
      rasterEffectsSet: rasterEffectsSet,
      artboardMm: {
        left: rounded(ptToMm(artboardRect[0])),
        top: rounded(ptToMm(artboardRect[1])),
        right: rounded(ptToMm(artboardRect[2])),
        bottom: rounded(ptToMm(artboardRect[3])),
        width: rounded(ptToMm(artboardRect[2] - artboardRect[0])),
        height: rounded(ptToMm(artboardRect[1] - artboardRect[3]))
      },
      placedItems: doc.placedItems.length,
      rasterItems: doc.rasterItems.length,
      layers: [],
      paths: [],
      texts: []
    };
    for (var layerIndex = 0; layerIndex < doc.layers.length; layerIndex += 1) {
      var layer = doc.layers[layerIndex];
      result.layers.push({
        index: layerIndex,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        pathCount: layer.pathItems.length,
        textCount: layer.textFrames.length
      });
      for (var pathIndex = 0; pathIndex < layer.pathItems.length; pathIndex += 1) {
        var pathItem = layer.pathItems[pathIndex];
        var anchors = [];
        for (var pointIndex = 0; pointIndex < pathItem.pathPoints.length; pointIndex += 1) {
          var anchor = pathItem.pathPoints[pointIndex].anchor;
          anchors.push({ x: rounded(ptToMm(anchor[0])), y: rounded(-ptToMm(anchor[1])) });
        }
        result.paths.push({ layer: layer.name, name: pathItem.name, anchors: anchors, editable: true });
      }
      for (var textIndex = 0; textIndex < layer.textFrames.length; textIndex += 1) {
        var frame = layer.textFrames[textIndex];
        result.texts.push({ layer: layer.name, name: frame.name, contents: frame.contents, editable: true });
      }
    }
    return result;
  }

  try {
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    for (var caseIndex = 0; caseIndex < CASES.length; caseIndex += 1) {
      var caseSpec = CASES[caseIndex];
      var scene = caseSpec.scene;
      var doc = app.documents.add(DocumentColorSpace.CMYK, mm(scene.page.width), mm(scene.page.height));
      doc.artboards[0].artboardRect = [0, 0, mm(scene.page.width), -mm(scene.page.height)];
      doc.rulerUnits = RulerUnits.Millimeters;
      var rasterEffectsSet = false;
      try {
        doc.rasterEffectSettings.resolution = 300;
        rasterEffectsSet = Math.abs(doc.rasterEffectSettings.resolution - 300) < 0.001;
      } catch (rasterError) {
        rasterEffectsSet = false;
      }
      var layerMap = createLayers(doc);
      for (var sourceIndex = 0; sourceIndex < ${JSON.stringify(LAYER_ORDER)}.length; sourceIndex += 1) {
        var sourceName = ${JSON.stringify(LAYER_ORDER)}[sourceIndex];
        var sourceLayer = scene.layers[sourceName];
        var targetLayer = layerMap[caseSpec.aiLayerNames[sourceName]];
        for (var itemIndex = 0; itemIndex < sourceLayer.items.length; itemIndex += 1) {
          var item = sourceLayer.items[itemIndex];
          var itemName = item.type + '_' + itemIndex;
          if (item.type === 'segment') addSegment(targetLayer, item, sourceLayer.style, itemName);
          else if (item.type === 'text') addText(targetLayer, item, sourceLayer.style, itemName);
        }
      }
      for (var lockIndex = 0; lockIndex < REQUIRED_LAYERS.length; lockIndex += 1) {
        var requiredLayer = layerMap[REQUIRED_LAYERS[lockIndex]];
        requiredLayer.visible = true;
        requiredLayer.locked = REQUIRED_LAYERS[lockIndex] !== '01_ARTWORK';
      }
      var outputFile = new File(caseSpec.outputPath);
      var saveOptions = new IllustratorSaveOptions();
      saveOptions.pdfCompatible = true;
      saveOptions.compressed = true;
      saveOptions.embedICCProfile = true;
      doc.saveAs(outputFile, saveOptions);
      doc.close(SaveOptions.DONOTSAVECHANGES);

      var reopened = app.open(outputFile);
      report.cases.push(inspectDocument(reopened, caseSpec, rasterEffectsSet));
      reopened.close(SaveOptions.DONOTSAVECHANGES);
    }
    report.completed = true;
  } catch (error) {
    report.completed = false;
    report.error = String(error) + (error.line ? ' at line ' + error.line : '');
    try {
      while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
    } catch (closeError) {}
  } finally {
    app.userInteractionLevel = previousInteractionLevel;
    writeJson(REPORT_PATH, report);
  }
}());
`;
}

export async function prepareIllustratorRoundtrip() {
  const payload = preparePayload();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(EXPECTED_PATH, `${JSON.stringify({
    schema: 'xiecheng.a1.illustrator-canonical-scenes.v1',
    generatedFrom: 'geometry.mjs#buildScene',
    aiLayerOrder: AI_LAYER_ORDER,
    cases: payload,
  }, null, 2)}\n`, 'utf8');
  await writeFile(JSX_PATH, buildJsx(payload), 'utf8');
  for (const item of payload) {
    const base = path.join(OUTPUT_DIR, item.fileBase);
    await writeFile(`${base}.svg`, sceneToSvg(item.scene), 'utf8');
    await writeFile(`${base}.pdf`, sceneToPdfBytes(item.scene));
    await writeFile(`${base}.json`, `${JSON.stringify(item.serializedCase, null, 2)}\n`, 'utf8');
  }
  return { jsxPath: JSX_PATH, reportPath: REPORT_PATH, cases: payload.length };
}

const near = (actual, expected, label) => {
  const delta = Math.abs(Number(actual) - Number(expected));
  assert.ok(delta <= TOLERANCE_MM, `${label}: ${actual} vs ${expected}, delta ${delta} mm`);
  return delta;
};

function expectedSegments(payloadCase) {
  const segments = [];
  for (const sourceName of LAYER_ORDER) {
    const sourceLayer = payloadCase.scene.layers[sourceName];
    sourceLayer.items.forEach((item, index) => {
      if (item.type === 'segment') {
        segments.push({
          layer: payloadCase.aiLayerNames[sourceName],
          name: `segment_${index}`,
          anchors: [{ x: item.x1, y: item.y1 }, { x: item.x2, y: item.y2 }],
        });
      }
    });
  }
  return segments.sort((a, b) => `${a.layer}/${a.name}`.localeCompare(`${b.layer}/${b.name}`));
}

function expectedTexts(payloadCase) {
  const texts = [];
  for (const sourceName of LAYER_ORDER) {
    const sourceLayer = payloadCase.scene.layers[sourceName];
    sourceLayer.items.forEach((item, index) => {
      if (item.type === 'text') {
        texts.push({
          layer: payloadCase.aiLayerNames[sourceName],
          name: `text_${index}`,
          contents: item.value,
        });
      }
    });
  }
  return texts.sort((a, b) => `${a.layer}/${a.name}`.localeCompare(`${b.layer}/${b.name}`));
}

export async function validateIllustratorRoundtrip() {
  const expectedDocument = JSON.parse(await readFile(EXPECTED_PATH, 'utf8'));
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  assert.equal(report.completed, true, report.error || 'Illustrator round-trip did not complete');
  assert.equal(report.cases.length, expectedDocument.cases.length);
  let maximumDeltaMm = 0;
  const cases = [];
  for (const expectedCase of expectedDocument.cases) {
    const actual = report.cases.find((entry) => entry.id === expectedCase.id);
    assert.ok(actual, `Missing Illustrator report for ${expectedCase.id}`);
    assert.equal(actual.cmykDocument, true);
    assert.equal(actual.placedItems, 0);
    assert.equal(actual.rasterItems, 0);
    assert.deepEqual(actual.layers.map((layer) => layer.name), AI_LAYER_ORDER);
    for (const layer of actual.layers) {
      assert.equal(layer.visible, true, `${actual.id}/${layer.name} must be visible`);
      assert.equal(layer.locked, layer.name !== '01_ARTWORK', `${actual.id}/${layer.name} lock state`);
    }
    const artwork = actual.layers[0];
    assert.equal(artwork.pathCount, 0);
    assert.equal(artwork.textCount, 0);
    maximumDeltaMm = Math.max(
      maximumDeltaMm,
      near(actual.artboardMm.width, expectedCase.scene.page.width, `${actual.id} artboard width`),
      near(actual.artboardMm.height, expectedCase.scene.page.height, `${actual.id} artboard height`),
    );
    const expectedPaths = expectedSegments(expectedCase);
    const actualPaths = [...actual.paths].sort((a, b) => `${a.layer}/${a.name}`.localeCompare(`${b.layer}/${b.name}`));
    assert.equal(actualPaths.length, expectedPaths.length, `${actual.id} path count`);
    for (let index = 0; index < expectedPaths.length; index += 1) {
      const expectedPath = expectedPaths[index];
      const actualPath = actualPaths[index];
      assert.equal(`${actualPath.layer}/${actualPath.name}`, `${expectedPath.layer}/${expectedPath.name}`);
      assert.equal(actualPath.editable, true);
      for (let point = 0; point < expectedPath.anchors.length; point += 1) {
        maximumDeltaMm = Math.max(
          maximumDeltaMm,
          near(actualPath.anchors[point].x, expectedPath.anchors[point].x, `${actual.id}/${actualPath.name} x${point}`),
          near(actualPath.anchors[point].y, expectedPath.anchors[point].y, `${actual.id}/${actualPath.name} y${point}`),
        );
      }
    }
    const expectedTextItems = expectedTexts(expectedCase);
    const actualTextItems = [...actual.texts].sort((a, b) => `${a.layer}/${a.name}`.localeCompare(`${b.layer}/${b.name}`));
    assert.equal(actualTextItems.length, expectedTextItems.length, `${actual.id} text count`);
    for (let index = 0; index < expectedTextItems.length; index += 1) {
      assert.equal(`${actualTextItems[index].layer}/${actualTextItems[index].name}`, `${expectedTextItems[index].layer}/${expectedTextItems[index].name}`);
      assert.equal(actualTextItems[index].contents, expectedTextItems[index].contents);
      assert.equal(actualTextItems[index].editable, true);
    }

    const svg = await readFile(path.join(OUTPUT_DIR, `${expectedCase.fileBase}.svg`), 'utf8');
    assert.match(svg, new RegExp(`width="${expectedCase.scene.page.width}mm"`));
    assert.match(svg, new RegExp(`height="${expectedCase.scene.page.height}mm"`));
    for (const segment of expectedPaths) {
      const [first, second] = segment.anchors;
      assert.ok(svg.includes(`x1="${first.x}" y1="${first.y}" x2="${second.x}" y2="${second.y}"`), `${actual.id} SVG segment mismatch`);
    }
    const pdf = await readFile(path.join(OUTPUT_DIR, `${expectedCase.fileBase}.pdf`), 'latin1');
    assert.match(pdf, /^%PDF-1\.4/);
    assert.ok(!pdf.includes('/Subtype /Image'), `${actual.id} PDF must not contain raster images`);

    cases.push({
      id: actual.id,
      nominal: expectedCase.caseData.nominal,
      layout: expectedCase.caseData.layout,
      panelsMm: expectedCase.scene.geometry.panelWidthsMm,
      glueFlapMm: expectedCase.scene.geometry.glueFlapMm,
      topFlapMm: expectedCase.scene.geometry.topFlapMm,
      bottomFlapMm: expectedCase.scene.geometry.bottomFlapMm,
      totalWidthMm: expectedCase.scene.geometry.totalWidthMm,
      totalHeightMm: expectedCase.scene.geometry.totalHeightMm,
      aiVsCanonical: 'PASS',
      aiVsSvg: 'PASS',
      aiVsPdf: 'PASS',
    });
  }
  return {
    status: 'AI_NATIVE_COMPLETE',
    illustratorVersion: report.illustratorVersion,
    toleranceMm: TOLERANCE_MM,
    maximumDeltaMm,
    rasterEffects300Ppi: report.cases.every((item) => item.rasterEffectsPpi === 300),
    cases,
  };
}

async function main() {
  const command = process.argv[2] || 'prepare';
  if (command === 'prepare') console.log(JSON.stringify(await prepareIllustratorRoundtrip(), null, 2));
  else if (command === 'validate') console.log(JSON.stringify(await validateIllustratorRoundtrip(), null, 2));
  else throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
