import {
  buildScene,
  calculateGeometry,
  createCase,
  dimensionText,
  formatMm,
  normalizeImportedCase,
  sceneToPdfBytes,
  sceneToSvg,
  serializeCase,
  validateCase,
} from './geometry.mjs';

const $ = (id) => document.getElementById(id);
const numberValue = (id) => Number($(id).value);

function readForm() {
  const nominal = { L: numberValue('L'), W: numberValue('W'), H: numberValue('H') };
  const layoutOverride = $('layoutOverride').checked;
  const layout = layoutOverride
    ? { L: numberValue('layoutL'), W: numberValue('layoutW'), H: numberValue('layoutH') }
    : nominal;
  return createCase({ caseCode: $('caseCode').value, revision: numberValue('revision'), nominal, layout, layoutOverride });
}

function syncLayoutFromNominal() {
  if ($('layoutOverride').checked) return;
  for (const key of ['L', 'W', 'H']) $(`layout${key}`).value = $(key).value;
}

function render() {
  syncLayoutFromNominal();
  const caseData = readForm();
  $('layoutOverrideBox').hidden = !caseData.layoutOverride;
  const errors = validateCase(caseData);
  $('err').hidden = errors.length === 0;
  $('err').textContent = errors.join('；');
  if (errors.length) {
    $('drawing').replaceChildren();
    return;
  }
  const geometry = calculateGeometry(caseData);
  $('drawing').innerHTML = sceneToSvg(buildScene(caseData));
  $('totalSize').textContent = `${formatMm(geometry.totalWidthMm)} × ${formatMm(geometry.totalHeightMm)} mm`;
  $('panelSizes').textContent = geometry.panelWidthsMm.map(formatMm).join(' / ');
  $('verticalSizes').textContent = `${formatMm(geometry.topFlapMm)} / ${formatMm(geometry.bodyHeightMm)} / ${formatMm(geometry.bottomFlapMm)} mm`;
  $('nominalSize').textContent = `${dimensionText(caseData.nominal)} mm`;
  $('layoutSize').textContent = `${dimensionText(caseData.layout)} mm`;
}

function download(data, mimeType, fileName) {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function fileBase(caseData) {
  const revision = String(caseData.revision).padStart(3, '0');
  return `${caseData.caseCode}_R${revision}_A1_${dimensionText(caseData.nominal).replaceAll(' ', '')}_V03`;
}

function currentValidCase() {
  const caseData = readForm();
  const errors = validateCase(caseData);
  if (errors.length) {
    render();
    return null;
  }
  return caseData;
}

$('downloadPdf').addEventListener('click', () => {
  const caseData = currentValidCase();
  if (caseData) download(sceneToPdfBytes(buildScene(caseData)), 'application/pdf', `${fileBase(caseData)}.pdf`);
});

$('downloadSvg').addEventListener('click', () => {
  const caseData = currentValidCase();
  if (caseData) download(sceneToSvg(buildScene(caseData)), 'image/svg+xml', `${fileBase(caseData)}.svg`);
});

$('downloadJson').addEventListener('click', () => {
  const caseData = currentValidCase();
  if (caseData) download(JSON.stringify(serializeCase(caseData), null, 2), 'application/json', `${fileBase(caseData)}.json`);
});

$('importJson').addEventListener('click', () => {
  $('jsonFile').value = '';
  $('jsonFile').click();
});

$('jsonFile').addEventListener('change', async () => {
  try {
    const [file] = $('jsonFile').files;
    if (!file) return;
    const caseData = normalizeImportedCase(JSON.parse(await file.text()));
    $('caseCode').value = caseData.caseCode;
    $('revision').value = caseData.revision;
    for (const key of ['L', 'W', 'H']) {
      $(key).value = caseData.nominal[key];
      $(`layout${key}`).value = caseData.layout[key];
    }
    $('layoutOverride').checked = caseData.layoutOverride;
    render();
  } catch (error) {
    $('err').hidden = false;
    $('err').textContent = `匯入失敗：${error.message}`;
  }
});

document.querySelectorAll('input:not([type="file"])').forEach((input) => {
  input.addEventListener('input', render);
  input.addEventListener('change', render);
});

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    const [L, W, H, layoutL, layoutW, layoutH] = button.dataset.preset.split(',').map(Number);
    $('L').value = L;
    $('W').value = W;
    $('H').value = H;
    const hasOverride = Number.isFinite(layoutL);
    $('layoutOverride').checked = hasOverride;
    $('layoutL').value = hasOverride ? layoutL : L;
    $('layoutW').value = hasOverride ? layoutW : W;
    $('layoutH').value = hasOverride ? layoutH : H;
    render();
  });
});

render();
