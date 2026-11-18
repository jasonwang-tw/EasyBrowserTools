import { MODEL_PERMISSION, MODEL_KEY, MODEL_BYTES } from './model-store.js';

export function modelControls({ changed, locked, activityChanged = () => {}, openManagement }) {
  const $ = id => document.getElementById(id);
  let installed = false, downloading = false, port = null, heartbeat = null, closing = false;
  let engine = 'standard';
  let downloadRequest = 0;
  function message(text) { $('model-status').textContent = text; }
  function render() {
    $('engine').value = engine;
    $('engine').disabled = downloading || locked();
    $('download-model').hidden = installed;
    $('delete-model').hidden = !installed;
    $('download-model').disabled = downloading || locked();
    $('delete-model').disabled = downloading || locked();
    $('cancel-download').hidden = !downloading;
    $('model-progress').hidden = !downloading;
    $('enhanced-note').hidden = engine !== 'enhanced';
    $('ocr-model-state').textContent = downloading ? '下載中' : installed ? '已安裝' : '未安裝';
    $('ocr-model-state').classList.toggle('complete', installed && !downloading);
  }
  const send = async type => {
    const result = await chrome.runtime.sendMessage({ type });
    if (!result?.success) throw new Error(result?.error || '模型管理服務無法使用，請重新載入擴充功能');
    return result;
  };
  async function refresh() {
    const state = await send('MODEL_STATUS');
    installed = state.installed;
    if (!installed) engine = 'standard';
    message(installed ? '加強模型已安裝，可離線辨識。' : '尚未下載。選用加強辨識需下載約 31.2 MB；圖片留在本機。');
    render();
  }
  async function initialize() {
    try {
      const preference = await chrome.storage.local.get(MODEL_KEY);
      engine = preference[MODEL_KEY] === 'enhanced' ? 'enhanced' : 'standard';
      await refresh();
    } catch (error) { engine = 'standard'; message(error.message); render(); }
  }
  $('engine').addEventListener('change', async () => {
    if (locked() || downloading) { render(); return; }
    if ($('engine').value === 'enhanced' && !installed) {
      render(); message('請先按「下載並啟用」。未下載時仍使用內建 OCR。'); openManagement('ocr'); return;
    }
    const next = $('engine').value;
    try { await chrome.storage.local.set({ [MODEL_KEY]: next }); engine = next; render(); changed(); }
    catch (error) { message(error.message); render(); }
  });
  function disconnect() {
    clearInterval(heartbeat); heartbeat = null;
    const old = port; port = null; old?.disconnect();
  }
  $('download-model').addEventListener('click', async () => {
    if (locked() || downloading) return;
    downloading = true; render(); activityChanged();
    const attempt = ++downloadRequest;
    try {
      // Called directly from the click, preserving Chrome's user activation.
      if (!await chrome.permissions.request({ origins: [MODEL_PERMISSION] })) throw new Error('未允許下載來源，繼續使用內建 OCR。');
      if (closing || attempt !== downloadRequest) return;
      port = chrome.runtime.connect({ name: 'pagekit-model-download' });
      const current = port;
      current.onMessage.addListener(async event => {
        if (port !== current) return;
        if (event.type === 'PROGRESS') {
          $('model-progress').value = event.received / MODEL_BYTES;
          message(`模型下載中… ${(event.received / 1_000_000).toFixed(1)} / 31.2 MB`); return;
        }
        if (!['DONE', 'ERROR'].includes(event.type)) return;
        disconnect(); downloading = false; activityChanged();
        if (event.type === 'DONE') { installed = true; engine = 'enhanced'; message('下載及 SHA-256 驗證完成，已啟用加強辨識。'); render(); changed(); }
        else { message(event.error); render(); }
      });
      current.onDisconnect.addListener(() => {
        if (port !== current) return;
        const reason = chrome.runtime.lastError?.message;
        disconnect(); downloading = false; activityChanged(); message(reason || '下載連線中斷，請重試；內建 OCR 仍可使用。'); render();
      });
      // Port messages keep MV3's service worker alive while a slow download runs.
      heartbeat = setInterval(() => { try { current.postMessage({ type: 'PING' }); } catch {} }, 20_000);
      message('正在連線下載模型…'); $('model-progress').value = 0;
      current.postMessage({ type: 'START' });
    } catch (error) { if (closing || attempt !== downloadRequest) return; disconnect(); downloading = false; activityChanged(); message(error.message); render(); }
  });
  $('cancel-download').addEventListener('click', () => {
    if (port) { port.postMessage({ type: 'CANCEL' }); message('正在取消下載…'); }
    else { downloadRequest++; downloading = false; activityChanged(); message('已取消下載，繼續使用內建 OCR。'); render(); }
  });
  $('delete-model').addEventListener('click', async () => {
    if (locked() || downloading) return;
    $('delete-model').disabled = true;
    try {
      await send('MODEL_DELETE'); installed = false; engine = 'standard'; render();
      message('加強模型已刪除，已切換內建 OCR。'); changed();
    } catch (error) { message(error.message); render(); }
  });
  const storageChanged = (changes, area) => {
    if (area !== 'local' || !changes[MODEL_KEY] || downloading || closing) return;
    // Other windows can install/delete a model. Defer the next inference until
    // their state is refreshed; never change an in-flight job or its clipboard.
    void refresh().then(async () => {
      const value = await chrome.storage.local.get(MODEL_KEY);
      engine = installed && value[MODEL_KEY] === 'enhanced' ? 'enhanced' : 'standard';
      render(); if (!locked()) changed();
    }).catch(error => message(error.message));
  };
  chrome.storage.onChanged.addListener(storageChanged);
  return { initialize, render, get engine() { return engine; }, get downloading() { return downloading; }, destroy() { closing = true; disconnect(); chrome.storage.onChanged.removeListener(storageChanged); } };
}
