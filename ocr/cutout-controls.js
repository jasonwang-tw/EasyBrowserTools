import { CUTOUT_PERMISSION, CUTOUT_FILE, CUTOUT_KEY } from './cutout-model-store.js';

export function cutoutControls({ source, editor, locked, changed, openManagement }) {
  const $ = id => document.getElementById(id);
  let installed = false, downloading = false, running = false, closing = false;
  let port = null, heartbeat = null, worker = null, timer = null, result = null, attempt = 0, run = 0;
  const message = (text, error = false) => { $('cutout-status').textContent = text; $('cutout-status').classList.toggle('error', error); };
  function render() {
    const blocked = locked() || downloading || running;
    $('remove-background').disabled = blocked || !editor();
    $('restore-background').disabled = blocked || !result;
    $('download-cutout-model').hidden = installed;
    $('delete-cutout-model').hidden = !installed;
    $('download-cutout-model').disabled = blocked;
    $('delete-cutout-model').disabled = blocked;
    $('cancel-cutout-download').hidden = !downloading;
    $('cancel-cutout').hidden = !running;
    $('cutout-download-progress').hidden = !downloading;
    $('cutout-progress').hidden = !running;
    $('cutout-state').textContent = running ? '處理中…' : result ? '透明預覽' : '保留原圖';
    $('cutout-state').classList.toggle('complete', Boolean(result) && !running);
    $('cutout-model-state').textContent = downloading ? '下載中' : installed ? '已安裝' : '未安裝';
    $('cutout-model-state').classList.toggle('complete', installed && !downloading);
  }
  function notify() { render(); changed(); }
  const send = async type => {
    const response = await chrome.runtime.sendMessage({ type });
    if (!response?.success) throw Error(response?.error || '模型服務無法使用，請重新載入擴充功能');
    return response;
  };
  async function refresh() {
    installed = (await send('CUTOUT_MODEL_STATUS')).installed;
    $('cutout-model-status').textContent = installed ? 'BiRefNet Lite 已安裝，可離線去背。' : '尚未安裝。首次自選下載約 101.1 MB，圖片留在本機。';
    render();
  }
  function disconnect() { clearInterval(heartbeat); heartbeat = null; const old = port; port = null; old?.disconnect(); }
  $('download-cutout-model').addEventListener('click', async () => {
    if (locked() || downloading || running) return;
    downloading = true; const currentAttempt = ++attempt; notify();
    try {
      // Keep this permission request directly inside the user click.
      const allowed = await chrome.permissions.request({ origins: CUTOUT_PERMISSION });
      if (closing || currentAttempt !== attempt) return;
      if (!allowed) throw Error('未允許模型來源；尚未下載，原有功能可繼續使用。');
      port = chrome.runtime.connect({ name: 'pagekit-cutout-download' });
      const current = port;
      current.onMessage.addListener(event => {
        if (port !== current) return;
        if (event.type === 'PROGRESS') {
          $('cutout-download-progress').value = event.received / CUTOUT_FILE.bytes;
          $('cutout-model-status').textContent = `去背模型下載中… ${(event.received / 1_000_000).toFixed(1)} / 101.1 MB`;
          return;
        }
        if (!['DONE', 'ERROR'].includes(event.type)) return;
        disconnect(); downloading = false;
        if (event.type === 'DONE') { installed = true; $('cutout-model-status').textContent = '下載與 SHA-256 驗證完成，可離線去背。'; message('模型已就緒，請按「自動去背」。'); }
        else { $('cutout-model-status').textContent = event.error; }
        notify();
      });
      current.onDisconnect.addListener(() => {
        if (port !== current) return;
        const reason = chrome.runtime.lastError?.message;
        disconnect(); downloading = false;
        $('cutout-model-status').textContent = reason || '下載連線中斷，請重新下載。'; notify();
      });
      heartbeat = setInterval(() => { try { current.postMessage({ type: 'PING' }); } catch {} }, 20_000);
      $('cutout-model-status').textContent = '正在連線下載去背模型…'; $('cutout-download-progress').value = 0;
      current.postMessage({ type: 'START' });
    } catch (error) {
      if (closing || currentAttempt !== attempt) return;
      disconnect(); downloading = false; $('cutout-model-status').textContent = error.message; notify();
    }
  });
  $('cancel-cutout-download').addEventListener('click', () => {
    if (port) { port.postMessage({ type: 'CANCEL' }); $('cutout-model-status').textContent = '正在取消下載…'; }
    else { attempt++; downloading = false; $('cutout-model-status').textContent = '已取消，尚未下載模型。'; notify(); }
  });
  $('delete-cutout-model').addEventListener('click', async () => {
    if (locked() || downloading || running) return;
    $('delete-cutout-model').disabled = true;
    try { await send('CUTOUT_MODEL_DELETE'); installed = false; $('cutout-model-status').textContent = '去背模型已刪除；目前圖片與 OCR 模型不受影響。'; }
    catch (error) { $('cutout-model-status').textContent = error.message; }
    render();
  });
  function finish() { clearTimeout(timer); timer = null; worker?.terminate(); worker = null; running = false; notify(); }
  function cancel() { run++; finish(); message('已取消去背，圖片不變。'); }
  $('cancel-cutout').addEventListener('click', cancel);
  $('remove-background').addEventListener('click', async () => {
    if (locked() || downloading || running || !editor()) return;
    try {
      await refresh();
      if (closing || locked() || downloading || running) return;
      if (!installed) { openManagement('cutout'); message('請先下載去背模型，完成後再按「自動去背」。'); return; }
      editor().finishText(true); editor().cancel();
      running = true; const current = ++run; notify();
      $('cutout-progress').value = 0; message('正在準備原圖…');
      const bitmap = await createImageBitmap(source());
      if (closing || current !== run) { bitmap.close(); return; }
      worker = new Worker(chrome.runtime.getURL('ocr/cutout-worker.js'), { type: 'module' });
      timer = setTimeout(() => { if (current !== run) return; run++; finish(); message('去背逾時，原圖已保留。可縮小圖片後重試。', true); }, 180_000);
      worker.onerror = event => { event.preventDefault(); if (current !== run) return; finish(); message(event.message || '本機去背失敗，原圖已保留。', true); };
      worker.onmessage = ({ data }) => {
        if (current !== run || closing) { data.bitmap?.close(); return; }
        if (data.type === 'PROGRESS') { $('cutout-progress').value = data.value; message(data.text); }
        else if (data.type === 'ERROR') { finish(); message(data.error, true); }
        else if (data.type === 'RESULT') {
          result?.close?.(); result = data.bitmap;
          editor().source = result; editor().render();
          $('preview').classList.add('transparent-preview'); finish();
          message('去背完成，正在預覽透明圖片。可還原原圖；請核對邊緣後複製或下載 PNG。');
        }
      };
      worker.postMessage({ bitmap }, [bitmap]);
    } catch (error) { finish(); message(error.message || '去背失敗，原圖已保留。', true); }
  });
  function restore() {
    if (editor()) { editor().finishText(true); editor().cancel(); editor().source = source(); editor().render(); }
    result?.close?.(); result = null; $('preview').classList.remove('transparent-preview'); render();
  }
  $('restore-background').addEventListener('click', () => { if (locked() || downloading || running) return; restore(); message('已還原原圖，標註保留。'); });
  const storageChanged = (changes, area) => {
    if (!closing && area === 'local' && changes[CUTOUT_KEY] && !downloading) void refresh().catch(error => { $('cutout-model-status').textContent = error.message; });
  };
  chrome.storage.onChanged.addListener(storageChanged);
  return {
    async initialize() { try { await refresh(); } catch (error) { $('cutout-model-status').textContent = error.message; render(); } },
    render, get working() { return running || downloading; }, get downloading() { return downloading; },
    setPreview(value) { result?.close?.(); result=value; if(editor())editor().source=value||source(); $('preview').classList.toggle('transparent-preview',Boolean(value)); render(); },
    reset() { run++; finish(); restore(); message('自動分離商品或人物背景；圖片全程留在本機。'); },
    destroy() { closing = true; attempt++; run++; disconnect(); clearTimeout(timer); worker?.terminate(); result?.close?.(); result = null; chrome.storage.onChanged.removeListener(storageChanged); }
  };
}
