import { MODEL_FILES, MODEL_PERMISSION, MODEL_KEY, saveModel, modelReady, deleteModel } from './model-store.js';

export function isModelPage(sender, runtime) {
  return sender?.id === runtime.id && sender.url?.split(/[?#]/)[0] === runtime.getURL('ocr/ocr.html');
}
export async function downloadModels({ signal, fetcher = fetch, progress = () => {}, save = saveModel }) {
  const record = await downloadFixedFiles({ files: MODEL_FILES, signal, fetcher, progress });
  signal.throwIfAborted();
  // Verification and the only persistent write happen after both files finish.
  await save(record, signal);
}
export async function downloadFixedFiles({ files, signal, fetcher = fetch, progress = () => {} }) {
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  const record = {};
  let completed = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const response = await fetcher(file.url, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error(`模型下載失敗（${response.status}）`);
    const reader = response.body.getReader();
    const data = new Uint8Array(file.bytes);
    let offset = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.byteLength > file.bytes) throw new Error('模型大小不符，已停止下載');
        data.set(value, offset);
        offset += value.byteLength;
        progress({ received: completed + offset, total });
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (offset !== file.bytes) throw new Error('模型下載不完整，請重試');
    record[file.key] = data.buffer;
    completed += offset;
  }
  signal.throwIfAborted();
  return record;
}

export function installModelService(api = chrome, { download = downloadModels, ready = modelReady, remove = deleteModel,
  statusType = 'MODEL_STATUS', deleteType = 'MODEL_DELETE', portName = 'pagekit-model-download', permissions = [MODEL_PERMISSION],
  onInstalled = () => api.storage.local.set({ [MODEL_KEY]: 'enhanced' }), onRemoved = () => api.storage.local.set({ [MODEL_KEY]: 'standard' }) } = {}) {
  let active = null;
  // Status/delete share this listener so there is one responder per message.
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (![statusType, deleteType].includes(message?.type) || !isModelPage(sender, api.runtime)) return false;
    const work = async () => {
      if (message.type === statusType) return { installed: await ready(), downloading: Boolean(active) };
      if (active) throw new Error('其他視窗正在下載模型，請先取消或等待完成');
      await remove();
      await onRemoved();
      return { installed: false };
    };
    work().then(result => respond({ success: true, ...result }), error => respond({ success: false, error: error.message }));
    return true;
  });
  api.runtime.onConnect.addListener(port => {
    if (port.name !== portName || !isModelPage(port.sender, api.runtime)) return;
    let controller = null;
    const post = value => { try { port.postMessage(value); } catch {} };
    port.onDisconnect.addListener(() => controller?.abort());
    port.onMessage.addListener(message => {
      if (message.type === 'CANCEL') { controller?.abort(); return; }
      if (message.type !== 'START' || controller) return;
      if (active) { post({ type: 'ERROR', error: '其他視窗正在下載模型，請稍後再試' }); return; }
      controller = new AbortController();
      const current = controller;
      active = current;
      void (async () => {
        const timeout = setTimeout(() => current.abort(), 300_000);
        try {
          if (!await api.permissions.contains({ origins: permissions })) throw new Error('尚未允許模型下載來源，請重新按「下載並啟用」');
          if (current.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          await download({ signal: current.signal, progress: value => post({ type: 'PROGRESS', ...value }) });
          // Once atomic save completes cancellation no longer discards a valid model.
          await onInstalled();
          post({ type: 'DONE' });
        } catch (error) {
          post({ type: 'ERROR', error: current.signal.aborted ? '已取消下載；原有模型不受影響' : error.message });
        } finally { clearTimeout(timeout); if (active === current) active = null; controller = null; }
      })();
    });
  });
}
