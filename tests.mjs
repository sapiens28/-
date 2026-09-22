import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLAP_RULE,
  GEOMETRY_STATUS,
  GLUE_FLAP_MM,
  LAYER_ORDER,
  SCHEMA,
  SLOT_STYLE,
  buildScene,
  calculateGeometry,
  createCase,
  normalizeImportedCase,
  sceneToPdfBytes,
  sceneToSvg,
  serializeCase,
} from './geometry.mjs';

test('six frozen geometry cases', () => {
  const cases = [
    { nominal: [250, 225, 200], expected: { top: 112.5, totalW: 980.3, totalH: 425 } },
    { nominal: [380, 300, 310], expected: { top: 150, totalW: 1390.3, totalH: 610 } },
    { nominal: [300, 180, 200], expected: { top: 90, totalW: 990.3, totalH: 380 } },
    { nominal: [200, 200, 200], expected: { top: 100, totalW: 830.3, totalH: 400 } },
    { nominal: [450, 300, 300], expected: { top: 150, totalW: 1530.3, totalH: 600 } },
  ];
  for (const testCase of cases) {
    const [L, W, H] = testCase.nominal;
    const geometry = calculateGeometry(createCase({ nominal: { L, W, H } }));
    assert.equal(geometry.glueFlapMm, 30.3);
    assert.equal(geometry.topFlapMm, testCase.expected.top);
    assert.equal(geometry.bottomFlapMm, testCase.expected.top);
    assert.equal(geometry.totalWidthMm, testCase.expected.totalW);
    assert.equal(geometry.totalHeightMm, testCase.expected.totalH);
    assert.deepEqual(geometry.panelWidthsMm, [L, W, L, W]);
  }
  const overrideCase = createCase({ nominal: { L: 200, W: 180, H: 200 }, layout: { L: 200, W: 182, H: 200 }, layoutOverride: true });
  const geometry = calculateGeometry(overrideCase);
  assert.deepEqual(overrideCase.nominal, { L: 200, W: 180, H: 200 });
  assert.deepEqual(overrideCase.layout, { L: 200, W: 182, H: 200 });
  assert.deepEqual(geometry.panelWidthsMm, [200, 182, 200, 182]);
  assert.equal(geometry.topFlapMm, 91);
  assert.equal(geometry.bottomFlapMm, 91);
});

test('semantic scene and vector exports', () => {
  const caseData = createCase({ nominal: { L: 200, W: 180, H: 200 }, layout: { L: 200, W: 182, H: 200 }, layoutOverride: true });
  const scene = buildScene(caseData);
  assert.deepEqual(Object.keys(scene.layers), LAYER_ORDER);
  assert.equal(scene.layers.SLOT_CUT_REFERENCE.items.length, 6);
  assert.equal(scene.layers.CREASE_REFERENCE.items.length, 6);
  assert.equal(scene.layers.GLUE_TAB.items.length, 3);
  assert.equal(scene.layers.ARTWORK.items.length, 0);
  const svg = sceneToSvg(scene);
  for (const layerName of LAYER_ORDER) assert.match(svg, new RegExp(`data-layer="${layerName}"`));
  assert.match(svg, /width="844\.3mm"/);
  assert.match(svg, /height="452mm"/);
  const pdfText = new TextDecoder().decode(sceneToPdfBytes(scene));
  assert.match(pdfText, /^%PDF-1\.4/);
  assert.match(pdfText, /\/MediaBox/);
  assert.match(pdfText, / m .* l S/);
  assert.doesNotMatch(pdfText, /\/Subtype \/Image/);
});

test('V0.3 JSON round-trip and legacy freeze migration', () => {
  const caseData = createCase({ caseCode: 'ROUNDTRIP', revision: 3, nominal: { L: 200, W: 180, H: 200 }, layout: { L: 200, W: 182, H: 200 }, layoutOverride: true });
  const serialized = serializeCase(caseData);
  assert.equal(serialized.schema, SCHEMA);
  assert.equal(serialized.boxType, 'A1');
  assert.equal(serialized.glueFlapMm, GLUE_FLAP_MM);
  assert.equal(serialized.flapRule, FLAP_RULE);
  assert.equal(serialized.slotStyle, SLOT_STYLE);
  assert.equal(serialized.geometryStatus, GEOMETRY_STATUS);
  assert.deepEqual(normalizeImportedCase(serialized), caseData);
  const legacy = {
    schema: 'xiecheng.a1.deploy-preview.v1',
    parameters: {
      caseCode: 'LEGACY-01', revision: 2,
      nominal: { L: 200, W: 180, H: 200 }, layout: { L: 200, W: 182, H: 200 }, override: true,
      G: 55, auto: false, top: 25, bottom: 40,
    },
  };
  const migratedGeometry = calculateGeometry(normalizeImportedCase(legacy));
  assert.equal(migratedGeometry.glueFlapMm, 30.3);
  assert.equal(migratedGeometry.topFlapMm, 91);
  assert.equal(migratedGeometry.bottomFlapMm, 91);
});
