export const PAPER_TONES = Object.freeze({
  kraft: Object.freeze({ token: 'PAPER_TONE_KRAFT', color: '#B78B5B', label: '牛皮色', status: 'VISUAL_PREVIEW_ONLY' }),
  imported: Object.freeze({ token: 'PAPER_TONE_IMPORTED_SIM', color: '#D2B586', label: '仿進口色', status: 'VISUAL_PREVIEW_ONLY' }),
  white: Object.freeze({ token: 'PAPER_TONE_WHITE', color: '#F6F3EB', label: '白色', status: 'VISUAL_PREVIEW_ONLY' }),
});

const PREVIEW_LAYER_ORDER = Object.freeze([
  'REFERENCE_OUTLINE',
  'CREASE_REFERENCE',
  'SLOT_CUT_REFERENCE',
  'GLUE_TAB',
]);

function paperFill(scene, tone) {
  const { origin, width, height } = scene.template;
  const glueFlapMm = scene.geometry.glueFlapMm;
  const mainX = origin.x + glueFlapMm;
  const glueSegments = scene.layers.GLUE_TAB.items.filter((item) => item.type === 'segment');
  const gluePoints = glueSegments.length === 3
    ? [
        [glueSegments[0].x1, glueSegments[0].y1],
        [glueSegments[0].x2, glueSegments[0].y2],
        [glueSegments[1].x2, glueSegments[1].y2],
        [glueSegments[2].x2, glueSegments[2].y2],
      ]
    : [];
  const gluePath = gluePoints.length
    ? `<polygon points="${gluePoints.map(([x, y]) => `${x},${y}`).join(' ')}"/>`
    : '';
  return `<g data-preview-layer="PAPER_TONE_PREVIEW" data-paper-tone="${tone.token}" data-preview-status="${tone.status}" fill="${tone.color}" stroke="none"><rect x="${mainX}" y="${origin.y}" width="${width - glueFlapMm}" height="${height}"/>${gluePath}</g>`;
}

function previewLines(scene) {
  return PREVIEW_LAYER_ORDER.map((layerName) => {
    const layer = scene.layers[layerName];
    const style = layer.style;
    const attributes = [
      `stroke="${style.stroke}"`,
      `stroke-width="${style.width || 0.25}"`,
      style.dash ? `stroke-dasharray="${style.dash.join(' ')}"` : '',
      'fill="none"',
      'vector-effect="non-scaling-stroke"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"',
    ].filter(Boolean).join(' ');
    const segments = layer.items
      .filter((item) => item.type === 'segment')
      .map((item) => `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}"/>`)
      .join('');
    return `<g data-preview-structure="${layerName}" ${attributes}>${segments}</g>`;
  }).join('');
}

export function sceneToPreviewSvg(scene, paperToneKey = 'kraft') {
  const tone = PAPER_TONES[paperToneKey] ?? PAPER_TONES.kraft;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.page.width}mm" height="${scene.page.height}mm" viewBox="0 0 ${scene.page.width} ${scene.page.height}" role="img" aria-labelledby="preview-title preview-desc"><title id="preview-title">A1 紙箱展開圖即時預覽</title><desc id="preview-desc">紙板顏色為螢幕搭配參考，結構比例依輸入尺寸即時更新。</desc><rect width="100%" height="100%" fill="#ffffff"/>${paperFill(scene, tone)}${previewLines(scene)}</svg>`;
}

export function paperToneDisclaimer() {
  return '紙色僅供螢幕視覺搭配參考，實際紙板與印刷效果以實物為準。';
}
