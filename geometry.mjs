export const SCHEMA = 'xiecheng.a1.print-template.v3';
export const GLUE_FLAP_MM = 30.3;
export const FLAP_RULE = 'LAYOUT_W_DIV_2';
export const SLOT_STYLE = 'XIECHENG_SLOT_STYLE_01';
export const GEOMETRY_STATUS = 'UNVERIFIED_PRINT_LAYOUT_TEMPLATE';

// Style 01 only freezes the presence of a slope. This value is intentionally
// isolated and labelled as unverified until a production owner confirms it.
export const SLOT_STYLE_01_INTERNAL_PARAMETER = Object.freeze({
  glueTabSlopeInsetMm: 8,
  verificationStatus: 'UNVERIFIED_STYLE_PARAMETER',
});

export const LAYER_ORDER = Object.freeze([
  'REFERENCE_OUTLINE',
  'CREASE_REFERENCE',
  'SLOT_CUT_REFERENCE',
  'GLUE_TAB',
  'DIMENSIONS',
  'FACE_IDS',
  'NOTES',
  'ARTWORK',
]);

const layerStyle = Object.freeze({
  REFERENCE_OUTLINE: { stroke: '#26352f', width: 0.55 },
  CREASE_REFERENCE: { stroke: '#dc2626', width: 0.35, dash: [3, 2] },
  SLOT_CUT_REFERENCE: { stroke: '#2563eb', width: 0.55 },
  GLUE_TAB: { stroke: '#26352f', width: 0.55 },
  DIMENSIONS: { stroke: '#718078', width: 0.25, fill: '#607069', fontSize: 4 },
  FACE_IDS: { fill: '#34443d', fontSize: 5 },
  NOTES: { fill: '#34443d', fontSize: 3.5 },
  ARTWORK: { stroke: '#111827', width: 0.25 },
});

const finiteNumber = (value) => Number(value);
export const formatMm = (value) => Number(Number(value).toFixed(3)).toString();
const sameDimensions = (a, b) => ['L', 'W', 'H'].every((key) => Number(a[key]) === Number(b[key]));

export function createCase(input = {}) {
  const nominalSource = input.nominal ?? input.nominalDimension ?? { L: input.L, W: input.W, H: input.H };
  const nominal = { L: finiteNumber(nominalSource.L), W: finiteNumber(nominalSource.W), H: finiteNumber(nominalSource.H) };
  const requestedOverride = Boolean(input.layoutOverride ?? input.override);
  const layoutSource = input.layout ?? input.layoutDimension ?? nominal;
  const layout = requestedOverride
    ? { L: finiteNumber(layoutSource.L), W: finiteNumber(layoutSource.W), H: finiteNumber(layoutSource.H) }
    : { ...nominal };
  return {
    caseCode: String(input.caseCode || 'XC-DEMO').trim() || 'XC-DEMO',
    revision: finiteNumber(input.revision ?? 1),
    nominal,
    layout,
    layoutOverride: requestedOverride,
    boxType: 'A1',
    glueFlapMm: GLUE_FLAP_MM,
    flapRule: FLAP_RULE,
    slotStyle: SLOT_STYLE,
    geometryStatus: GEOMETRY_STATUS,
  };
}

export function validateCase(caseData) {
  const errors = [];
  for (const [groupName, dimensions] of [['Nominal', caseData.nominal], ['Layout', caseData.layout]]) {
    for (const key of ['L', 'W', 'H']) {
      const value = dimensions[key];
      if (!Number.isFinite(value) || value < 20 || value > 1500) errors.push(`${groupName} ${key} 尺寸需為 20–1500 mm`);
    }
  }
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(caseData.caseCode)) errors.push('案件代碼限 1–24 個英數字、- 或 _');
  if (!Number.isInteger(caseData.revision) || caseData.revision < 1 || caseData.revision > 999) errors.push('版次需為 1–999 的整數');
  return errors;
}

export function calculateGeometry(caseData) {
  const { L, W, H } = caseData.layout;
  const topFlapMm = W / 2;
  const bottomFlapMm = W / 2;
  const panelWidthsMm = [L, W, L, W];
  const panelBoundariesMm = [GLUE_FLAP_MM];
  for (const width of panelWidthsMm) panelBoundariesMm.push(panelBoundariesMm.at(-1) + width);
  return {
    glueFlapMm: GLUE_FLAP_MM,
    topFlapMm,
    bottomFlapMm,
    bodyHeightMm: H,
    panelWidthsMm,
    panelBoundariesMm,
    totalWidthMm: GLUE_FLAP_MM + 2 * L + 2 * W,
    totalHeightMm: W + H,
  };
}

const segment = (x1, y1, x2, y2) => ({ type: 'segment', x1, y1, x2, y2 });
const text = (x, y, value, options = {}) => ({ type: 'text', x, y, value, ...options });

export function dimensionText(dimensions) {
  return ['L', 'W', 'H'].map((key) => formatMm(dimensions[key])).join(' x ');
}

export function buildScene(caseData) {
  const geometry = calculateGeometry(caseData);
  const margin = { left: 25, right: 25, top: 28, bottom: 42 };
  const origin = { x: margin.left, y: margin.top };
  const { glueFlapMm: G, topFlapMm: T, bottomFlapMm: B, bodyHeightMm: H, totalWidthMm: totalW, totalHeightMm: totalH, panelBoundariesMm: xs, panelWidthsMm: widths } = geometry;
  const slope = Math.min(SLOT_STYLE_01_INTERNAL_PARAMETER.glueTabSlopeInsetMm, H / 3);
  const at = (x, y) => ({ x: origin.x + x, y: origin.y + y });
  const segAt = (x1, y1, x2, y2) => segment(origin.x + x1, origin.y + y1, origin.x + x2, origin.y + y2);
  const layers = Object.fromEntries(LAYER_ORDER.map((name) => [name, { name, style: layerStyle[name], items: [] }]));

  layers.REFERENCE_OUTLINE.items.push(
    segAt(G, 0, totalW, 0),
    segAt(totalW, 0, totalW, totalH),
    segAt(totalW, totalH, G, totalH),
    segAt(G, totalH, G, T + H),
    segAt(G, T, G, 0),
  );

  layers.CREASE_REFERENCE.items.push(
    segAt(G, T, totalW, T),
    segAt(G, T + H, totalW, T + H),
    segAt(G, T, G, T + H),
  );
  for (let index = 1; index < xs.length - 1; index += 1) {
    layers.CREASE_REFERENCE.items.push(segAt(xs[index], T, xs[index], T + H));
    layers.SLOT_CUT_REFERENCE.items.push(
      segAt(xs[index], 0, xs[index], T),
      segAt(xs[index], T + H, xs[index], totalH),
    );
  }

  layers.GLUE_TAB.items.push(
    segAt(G, T, 0, T + slope),
    segAt(0, T + slope, 0, T + H - slope),
    segAt(0, T + H - slope, G, T + H),
  );

  for (let index = 0; index < widths.length; index += 1) {
    const centerX = (xs[index] + xs[index + 1]) / 2;
    layers.DIMENSIONS.items.push(
      text(origin.x + centerX, origin.y + Math.max(8, T / 2), `T${index + 1}  ${formatMm(widths[index])} x ${formatMm(T)}`, { anchor: 'middle' }),
      text(origin.x + centerX, origin.y + T + H + Math.max(8, B / 2), `B${index + 1}  ${formatMm(widths[index])} x ${formatMm(B)}`, { anchor: 'middle' }),
    );
    layers.FACE_IDS.items.push(text(origin.x + centerX, origin.y + T + H / 2, `P${index + 1} / ${index % 2 === 0 ? 'L' : 'W'} / ${formatMm(widths[index])}`, { anchor: 'middle' }));
  }
  const glueCenter = at(G / 2, T + H / 2);
  layers.DIMENSIONS.items.push(text(glueCenter.x, glueCenter.y, `G ${formatMm(G)}`, { anchor: 'middle', fontSize: 3 }));

  layers.NOTES.items.push(
    text(origin.x, 12, 'XIECHENG / A1 PRINT LAYOUT / SLOT STYLE 01', { fontSize: 4.2 }),
    text(origin.x, origin.y + totalH + 9, `CASE ${caseData.caseCode} | REVISION R${caseData.revision} | NOMINAL ${dimensionText(caseData.nominal)} mm | LAYOUT ${dimensionText(caseData.layout)} mm`),
    text(origin.x, origin.y + totalH + 16, `GLUE FLAP ${formatMm(G)} mm | TOP / BOTTOM RULE LAYOUT W / 2 | SLOT STYLE ${SLOT_STYLE}`),
    text(origin.x, origin.y + totalH + 23, `TOTAL ${formatMm(totalW)} x ${formatMm(totalH)} mm | FLAPS ${formatMm(T)} / ${formatMm(B)} mm | GLUE SLOPE ${SLOT_STYLE_01_INTERNAL_PARAMETER.verificationStatus}`),
    text(origin.x, origin.y + totalH + 30, `REFERENCE / CUSTOMER ARTWORK TEMPLATE | NOT PRODUCTION DIELINE | ${GEOMETRY_STATUS}`),
  );

  return {
    schema: 'xiecheng.a1.canonical-scene.v1',
    unit: 'mm',
    page: { width: totalW + margin.left + margin.right, height: totalH + margin.top + margin.bottom },
    template: { origin, width: totalW, height: totalH },
    geometry,
    layers,
  };
}

const xmlEscape = (value) => String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);

export function sceneToSvg(scene) {
  const groups = LAYER_ORDER.map((layerName) => {
    const layer = scene.layers[layerName];
    const style = layer.style;
    const attributes = [
      style.stroke ? `stroke="${style.stroke}"` : 'stroke="none"',
      style.fill ? `fill="${style.fill}"` : 'fill="none"',
      style.width ? `stroke-width="${style.width}"` : '',
      style.dash ? `stroke-dasharray="${style.dash.join(' ')}"` : '',
      'vector-effect="non-scaling-stroke"',
    ].filter(Boolean).join(' ');
    const content = layer.items.map((item) => {
      if (item.type === 'segment') return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}"/>`;
      const anchor = item.anchor || 'start';
      const fontSize = item.fontSize || style.fontSize || 4;
      return `<text x="${item.x}" y="${item.y}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize}" stroke="none" fill="${style.fill || '#34443d'}">${xmlEscape(item.value)}</text>`;
    }).join('');
    return `<g id="${layerName}" data-layer="${layerName}" ${attributes}>${content}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.page.width}mm" height="${scene.page.height}mm" viewBox="0 0 ${scene.page.width} ${scene.page.height}" role="img" aria-labelledby="scene-title scene-desc"><title id="scene-title">Xiecheng A1 print layout</title><desc id="scene-desc">Four body panels with separated top and bottom flaps, slot cut references, crease references, and a sloped glue tab.</desc><rect width="100%" height="100%" fill="white"/>${groups}</svg>`;
}

const PT_PER_MM = 72 / 25.4;
const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
};
const pdfNumber = (value) => Number(value).toFixed(3);
const pdfEscape = (value) => String(value).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');

export function sceneToPdfBytes(scene) {
  const commands = [];
  const pageHeightPt = scene.page.height * PT_PER_MM;
  for (const layerName of LAYER_ORDER) {
    const layer = scene.layers[layerName];
    const style = layer.style;
    if (style.stroke) {
      const [r, g, b] = hexToRgb(style.stroke);
      commands.push(`${pdfNumber(r)} ${pdfNumber(g)} ${pdfNumber(b)} RG`, `${pdfNumber((style.width || 0.25) * PT_PER_MM)} w`);
      commands.push(style.dash ? `[${style.dash.map((n) => pdfNumber(n * PT_PER_MM)).join(' ')}] 0 d` : '[] 0 d');
    }
    for (const item of layer.items) {
      if (item.type === 'segment') {
        commands.push(`${pdfNumber(item.x1 * PT_PER_MM)} ${pdfNumber(pageHeightPt - item.y1 * PT_PER_MM)} m ${pdfNumber(item.x2 * PT_PER_MM)} ${pdfNumber(pageHeightPt - item.y2 * PT_PER_MM)} l S`);
      } else {
        const size = (item.fontSize || style.fontSize || 4) * PT_PER_MM;
        const approximateWidth = item.value.length * size * 0.48;
        const alignOffset = item.anchor === 'middle' ? approximateWidth / 2 : 0;
        const [r, g, b] = hexToRgb(style.fill || '#34443d');
        commands.push(`${pdfNumber(r)} ${pdfNumber(g)} ${pdfNumber(b)} rg`, `BT /F1 ${pdfNumber(size)} Tf ${pdfNumber(item.x * PT_PER_MM - alignOffset)} ${pdfNumber(pageHeightPt - item.y * PT_PER_MM)} Td (${pdfEscape(item.value)}) Tj ET`);
      }
    }
  }
  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNumber(scene.page.width * PT_PER_MM)} ${pdfNumber(scene.page.height * PT_PER_MM)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n% XIECHENG A1 VECTOR\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function serializeCase(caseData) {
  const geometry = calculateGeometry(caseData);
  return {
    schema: SCHEMA,
    unit: 'mm',
    boxType: 'A1',
    glueFlapMm: GLUE_FLAP_MM,
    flapRule: FLAP_RULE,
    slotStyle: SLOT_STYLE,
    geometryStatus: GEOMETRY_STATUS,
    slotStyleParameters: { ...SLOT_STYLE_01_INTERNAL_PARAMETER },
    caseCode: caseData.caseCode,
    revision: caseData.revision,
    nominalDimension: { ...caseData.nominal },
    layoutOverride: caseData.layoutOverride,
    layoutDimension: { ...caseData.layout },
    derivedGeometry: {
      panelsMm: [...geometry.panelWidthsMm],
      topFlapMm: geometry.topFlapMm,
      bodyHeightMm: geometry.bodyHeightMm,
      bottomFlapMm: geometry.bottomFlapMm,
      totalWidthMm: geometry.totalWidthMm,
      totalHeightMm: geometry.totalHeightMm,
    },
  };
}

export function normalizeImportedCase(document) {
  if (!document || typeof document !== 'object') throw new Error('JSON 格式錯誤');
  const source = document.parameters ?? document.case ?? document;
  const nominalSource = source.nominalDimension ?? source.nominal ?? (source.L != null ? source : null);
  if (!nominalSource) throw new Error('找不到 Nominal L/W/H');
  const availableLayout = source.layoutDimension ?? source.layout ?? nominalSource;
  const explicitOverride = source.layoutOverride ?? source.override;
  const inferredOverride = !sameDimensions(nominalSource, availableLayout);
  const normalized = createCase({
    caseCode: source.caseCode,
    revision: source.revision,
    nominal: nominalSource,
    layout: availableLayout,
    layoutOverride: explicitOverride == null ? inferredOverride : Boolean(explicitOverride),
  });
  const errors = validateCase(normalized);
  if (errors.length) throw new Error(errors.join('；'));
  return normalized;
}
