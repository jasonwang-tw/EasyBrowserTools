import { JOB_TTL, screenshotRect, normalizeOcrText } from '../ocr-utils.js';
import { AnnotationEditor } from './annotation-editor.js';
import { recognizeCanvas } from './recognition.js';

const $ = id => document.getElementById(id);
$('version').textContent = `v${chrome.runtime.getManifest().version}`;
const image = document.createElement('canvas');
const preview = $('preview');
const output = $('text');
let selected = null;
let editor = null;
let busy = false;
let generation = 0;
let currentWorker = null;
let abortRun = null;
let pendingRecognition = null;

function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function updateControls(message) {
  $('undo').disabled = busy || !editor?.undoStack.length;
  $('redo').disabled = busy || !editor?.redoItems.length;
  $('delete-selected').disabled = busy || !editor?.selectedItem;
  $('next-number').textContent = editor?.nextNumber || 1;
  if (message) status(message);
}
function setBusy(value) {
  busy = value;
  $('language').disabled = value;
  $('upscale').disabled = value;
  $('layout').disabled = value;
  $('background').disabled = value;
  $('cjk-recovery').disabled = value || $('language').value === 'eng';
  for (const id of ['copy-image', 'save-image']) $(id).disabled = value || !selected;
  $('copy').disabled = value || !output.value;
  output.readOnly = value;
  for (const element of document.querySelectorAll('[data-tool], #color, #width, #text-size')) element.disabled = value || !selected;
  $('progress').hidden = !value;
  preview.setAttribute('aria-busy', String(value));
  if (editor) editor.disabled = value;
  updateControls();
}
async function recognize() {
  if (!selected || busy) return;
  const run = ++generation;
  const options = { language: $('language').value, upscale: $('upscale').checked, layout: $('layout').value, background: $('background').value, recoverCjk: $('cjk-recovery').checked };
  let worker;
  let timer;
  let segment = 0, segments = 1;
  setBusy(true);
  $('progress').value = 0;
  status('正在載入本機 OCR 引擎…');
  $('quality-note').hidden = true;
  try {
    const interrupted = new Promise((_, reject) => {
      abortRun = () => reject(new Error('已取消辨識'));
      timer = setTimeout(() => reject(new Error('辨識逾時，請縮小範圍後重試')), 120_000);
    });
    const work = (async () => {
      worker = await Tesseract.createWorker(options.language, 1, {
        workerPath: chrome.runtime.getURL('vendor/ocr/worker.min.js'),
        corePath: chrome.runtime.getURL('vendor/ocr/core'),
        langPath: chrome.runtime.getURL('vendor/ocr/lang'),
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: message => {
          if (run !== generation) return;
          if (message.status === 'recognizing text') {
            const progress = (segment + Math.max(0, Math.min(1, message.progress || 0))) / segments;
            $('progress').value = progress;
            status(`本機辨識中… ${Math.round(progress * 100)}%`);
          }
        }
      });
      if (run !== generation) return;
      currentWorker = worker;
      // Keep native pixels for line extraction; the recognizer enlarges each
      // text line once, or applies the requested 2x scale to whole-page OCR.
      const scale = Math.min(1, Math.sqrt(16_000_000 / (selected.width * selected.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(selected.width * scale));
      canvas.height = Math.max(1, Math.round(selected.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, selected.x, selected.y, selected.width, selected.height, 0, 0, canvas.width, canvas.height);
      const result = await recognizeCanvas(worker, canvas, { ...options, onSegment: (index, total) => { segment = index; segments = total; } });
      if (run !== generation) return;
      output.value = normalizeOcrText(result.data.text, options.language);
      $('quality-note').hidden = !output.value || !Number.isFinite(result.data.confidence) || result.data.confidence >= 75;
      $('copy').disabled = !output.value;
      if (output.value) await copyResult({ automatic: true, run });
      else status('未辨識到文字，請調整範圍或辨識語言後重試');
    })();
    // A late initialization after cancel/timeout must still release its worker.
    work.finally(() => { void worker?.terminate(); }).catch(() => {});
    await Promise.race([work, interrupted]);
  } catch (error) {
    if (run === generation) status(error.message || 'OCR 辨識失敗，請重新載入擴充功能後重試', true);
  } finally {
    clearTimeout(timer);
    if (run === generation) {
      generation++;
      abortRun = null;
      void worker?.terminate();
      currentWorker = null;
      setBusy(false);
    }
  }
}


async function copyResult({ automatic = false, run } = {}) {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
    if (run != null && run !== generation) return;
    status(automatic ? '辨識完成，已自動複製，可直接貼上（Ctrl+V／Cmd+V）' : '文字已複製，可直接貼上（Ctrl+V／Cmd+V）');
  } catch {
    if (run != null && run !== generation) return;
    if (document.hasFocus()) {
      output.focus();
      output.select();
    }
    status('辨識文字尚未複製，請點「複製文字」或選取結果後按 Ctrl+C／Cmd+C', true);
  }
}
$('copy').addEventListener('click', () => { void copyResult(); });

for (const id of ['language', 'upscale', 'layout', 'background', 'cjk-recovery']) $(id).addEventListener('change', () => {
  if (!selected || busy) return;
  clearTimeout(pendingRecognition);
  status('設定已變更，即將自動重新辨識…');
  pendingRecognition = setTimeout(() => {
    pendingRecognition = null;
    editor?.finishText(true);
    editor?.cancel();
    void recognize();
  }, 300);
});
output.addEventListener('input', () => { $('copy').disabled = !output.value; });
for (const button of document.querySelectorAll('[data-tool]')) button.addEventListener('click', () => {
  if (!editor) return;
  editor.finishText(true);
  editor.cancel();
  editor.tool = button.dataset.tool;
  $('screenshot').style.cursor = editor.tool === 'text' ? 'text' : 'crosshair';
  for (const tool of document.querySelectorAll('[data-tool]')) tool.setAttribute('aria-pressed', String(tool === button));
  $('text-size-label').hidden = editor.tool !== 'text';
  if (editor.tool === 'text') status('點擊圖片任意位置輸入文字；拖曳可移動既有文字，點一下既有文字可編輯');
  if (editor.tool === 'number') status('點擊圖片依序新增編號；點既有編號可選取，拖曳可移動，Delete／Backspace 可刪除');
});
$('color').addEventListener('input', () => { if (editor) editor.color = $('color').value; });
$('width').addEventListener('change', () => { if (editor) editor.width = Number($('width').value); });
$('text-size').addEventListener('change', () => { if (editor) editor.fontSize = Number($('text-size').value); });
$('undo').addEventListener('click', () => editor?.undo());
$('redo').addEventListener('click', () => editor?.redo());
$('delete-selected').addEventListener('click', () => editor?.deleteSelected());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') editor?.cancel();
  if (busy || !editor || event.target.closest('input, textarea, select, [contenteditable=true]')) return;
  if (['Delete', 'Backspace'].includes(event.key) && editor.deleteSelected()) {
    event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.shiftKey || event.key.toLowerCase() === 'y') editor.redo();
    else editor.undo();
  }
});
function imageBlob() {
  editor?.finishText(true);
  return new Promise((resolve, reject) => $('screenshot').toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片產生失敗')), 'image/png'));
}
$('copy-image').addEventListener('click', async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob() })]);
    status('圖片已複製，包含目前標註，可直接貼上');
  } catch { status('無法複製圖片，請改用「下載 PNG」', true); }
});
$('save-image').addEventListener('click', async () => {
  try {
    const url = URL.createObjectURL(await imageBlob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `easy-browser-tools-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    status('已開始下載 PNG，包含目前標註');
  } catch (error) { status(error.message, true); }
});
$('shortcuts').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_SHORTCUT_SETTINGS' });
    if (!response?.success) throw new Error(response?.error || '無法開啟設定');
  } catch { status('請在 chrome://extensions/shortcuts（Edge：edge://extensions/shortcuts）設定快捷鍵', true); }
});
chrome.commands.getAll().then(commands => {
  const shortcut = commands.find(command => command.name === 'capture-region')?.shortcut;
  $('shortcuts').textContent = shortcut ? `快捷鍵：${shortcut}` : '設定截圖快捷鍵';
}).catch(() => {});
window.addEventListener('pagehide', () => {
  clearTimeout(pendingRecognition);
  generation++;
  abortRun?.();
  void currentWorker?.terminate();
  editor?.destroy();
  image.width = image.height = 0;
  $('screenshot').width = $('screenshot').height = 0;
});

async function load() {
  setBusy(false);
  const error = new URLSearchParams(location.search).get('error');
  if (error) { status(error, true); return; }
  const id = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('沒有截圖，請回到一般網頁，使用快捷鍵或右鍵「截圖與標註」');
  const key = `ocr:${id}`;
  const { [key]: job } = await chrome.storage.session.get(key);
  await chrome.storage.session.remove(key);
  if (!job || Date.now() - job.createdAt > JOB_TTL) throw new Error('截圖已失效，請回到網頁重新截圖');
  const bitmap = new Image();
  bitmap.src = job.dataUrl;
  await bitmap.decode();
  const crop = job.target ? screenshotRect(job.target.rect, job.target.viewport, bitmap.naturalWidth, bitmap.naturalHeight)
    : { x: 0, y: 0, width: bitmap.naturalWidth, height: bitmap.naturalHeight };
  const scale = Math.min(1, Math.sqrt(16_000_000 / (crop.width * crop.height)));
  image.width = Math.max(1, Math.round(crop.width * scale));
  image.height = Math.max(1, Math.round(crop.height * scale));
  const context = image.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, image.width, image.height);
  bitmap.removeAttribute('src');
  selected = { x: 0, y: 0, width: image.width, height: image.height };
  editor = new AnnotationEditor($('screenshot'), image, updateControls);
  preview.hidden = false;
  $('dimensions').textContent = `${image.width} × ${image.height}`;
  setBusy(false);
  await recognize();
}
load().catch(error => { status(error.message || '截圖載入失敗，請重新截圖', true); });
