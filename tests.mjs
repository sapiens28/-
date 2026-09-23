import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
import { NATIVE_CASES, TOLERANCE_MM } from './illustrator-native.mjs';
import { PAPER_TONES, paperToneDisclaimer, sceneToPreviewSvg } from './preview.mjs';

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
  const notes = scene.layers.NOTES.items.map((item) => item.value).join('\n');
  assert.match(notes, /CASE XC-DEMO \| REVISION R1/);
  assert.match(notes, /GLUE FLAP 30\.3 mm/);
  assert.match(notes, /TOP \/ BOTTOM RULE LAYOUT W \/ 2/);
  assert.match(notes, /SLOT STYLE XIECHENG_SLOT_STYLE_01/);
  assert.match(notes, /REFERENCE \/ CUSTOMER ARTWORK TEMPLATE/);
  assert.match(notes, /NOT PRODUCTION DIELINE/);
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

test('Illustrator native cases reuse the canonical scene without changing frozen geometry', () => {
  assert.equal(TOLERANCE_MM, 0.01);
  assert.equal(NATIVE_CASES.length, 3);
  const [case1, case2, case3] = NATIVE_CASES.map(({ caseData }) => ({ caseData, scene: buildScene(caseData) }));
  assert.deepEqual(case1.scene.geometry, {
    glueFlapMm: 30.3,
    topFlapMm: 90,
    bottomFlapMm: 90,
    bodyHeightMm: 200,
    panelWidthsMm: [300, 180, 300, 180],
    panelBoundariesMm: [30.3, 330.3, 510.3, 810.3, 990.3],
    totalWidthMm: 990.3,
    totalHeightMm: 380,
  });
  assert.deepEqual(case2.scene.geometry.panelWidthsMm, [450, 300, 450, 300]);
  assert.equal(case2.scene.geometry.glueFlapMm, 30.3);
  assert.equal(case2.scene.geometry.topFlapMm, 150);
  assert.equal(case2.scene.geometry.bottomFlapMm, 150);
  assert.equal(case2.scene.geometry.totalWidthMm, 1530.3);
  assert.equal(case2.scene.geometry.totalHeightMm, 600);
  assert.deepEqual(case3.caseData.nominal, { L: 200, W: 180, H: 200 });
  assert.deepEqual(case3.caseData.layout, { L: 200, W: 182, H: 200 });
  assert.deepEqual(case3.scene.geometry.panelWidthsMm, [200, 182, 200, 182]);
  assert.equal(case3.scene.geometry.topFlapMm, 91);
  assert.equal(case3.scene.geometry.bottomFlapMm, 91);
});

test('paper tones affect only the preview render layer in all V0.4 QA cases', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PAPER_TONES).map(([key, tone]) => [key, tone.color])),
    { kraft: '#C1A369', imported: '#B47755', white: '#F6F3EB' },
  );
  const cases = [
    { nominal: { L: 300, W: 180, H: 200 } },
    { nominal: { L: 450, W: 300, H: 300 } },
    { nominal: { L: 200, W: 200, H: 200 } },
    {
      nominal: { L: 200, W: 180, H: 200 },
      layoutOverride: { enabled: true, L: 200, W: 182, H: 200 },
    },
  ];

  for (const [index, input] of cases.entries()) {
    const caseData = createCase({ caseCode: `TONE-${index + 1}`, revision: 1, ...input });
    const scene = buildScene(caseData);
    const pdfBefore = sceneToPdfBytes(scene);
    const exportSvgBefore = sceneToSvg(scene);
    const jsonBefore = serializeCase(caseData);

    for (const [key, tone] of Object.entries(PAPER_TONES)) {
      const previewSvg = sceneToPreviewSvg(scene, key);
      assert.match(previewSvg, new RegExp(`data-paper-tone="${tone.token}"`));
      assert.match(previewSvg, new RegExp(`fill="${tone.color}"`, 'i'));
      assert.match(previewSvg, /data-preview-status="VISUAL_PREVIEW_ONLY"/);
      assert.doesNotMatch(previewSvg, /<text\b/);
      assert.doesNotMatch(previewSvg, /FACE_IDS|DIMENSIONS|NOTES/);
      assert.deepEqual(sceneToPdfBytes(scene), pdfBefore);
      assert.equal(sceneToSvg(scene), exportSvgBefore);
      assert.deepEqual(serializeCase(caseData), jsonBefore);
    }

    for (const tone of Object.values(PAPER_TONES)) {
      assert.doesNotMatch(exportSvgBefore, new RegExp(tone.color, 'i'));
      assert.doesNotMatch(new TextDecoder().decode(pdfBefore), new RegExp(tone.token));
    }
  }

  assert.equal(paperToneDisclaimer(), '黃皮與仿進口（紅褐）皆為螢幕近似色，實際紙板與印刷效果以實物為準。');
});

test('V0.4 front-end exposes only the daily-use controls', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /紙箱尺寸/);
  assert.match(html, /data-paper-tone="kraft"/);
  assert.match(html, /data-paper-tone="imported"/);
  assert.match(html, /data-paper-tone="white"/);
  assert.match(html, /data-dashboard-control="paper-tone"/);
  assert.match(html, />黃皮<\/button>/);
  assert.match(html, />仿進口<\/button>/);
  assert.match(html, /<details id="advancedSettings"/);
  assert.match(html, /下載 PDF 作圖模板/);
  assert.match(html, /<div class="compatibilityControls" hidden>/);
  assert.match(html, /styles\.css\?v=20260923-2/);
  assert.match(html, /app\.mjs\?v=20260923-2/);
  assert.doesNotMatch(html, /Canonical Geometry|UNVERIFIED|Geometry Status|Native AI|Round-trip|SLOT STYLE 01/);
});
