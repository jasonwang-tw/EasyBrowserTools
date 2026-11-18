export const CUTOUT_PERMISSION = ['https://huggingface.co/*', 'https://us.aws.cdn.hf.co/*'];
export const CUTOUT_KEY = 'pagekitCutoutModel';
export const CUTOUT_ID = 'birefnet-lite-web-512-f01535dc';
export const CUTOUT_FILE = Object.freeze({ key: 'mask', url: 'https://huggingface.co/clevr-tools/birefnet-lite-web/resolve/f01535dcce4c28a8688ee631ca15719b779b3f86/birefnet_lite_512_fp16w.onnx', bytes: 101066931, sha256: '20e3fb3e7bbb75e0b4f152759413a6ab19a599a1c2e1db7ce7741792eaf639fb' });
export async function verifyCutout(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== CUTOUT_FILE.bytes) throw Error('去背模型大小不符，請重新下載');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== CUTOUT_FILE.sha256) throw Error('去背模型完整性驗證失敗，請重新下載');
}
async function transaction(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('pagekit-cutout-models', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('models', mode); let value;
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(tx.error || Error('去背模型儲存失敗，請確認磁碟空間'));
    try { action(tx.objectStore('models'), result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
  }); } finally { db.close(); }
}
export const readCutout = () => transaction('readonly', (store, done) => { const request = store.get(CUTOUT_ID); request.onsuccess = () => done(request.result); });
// Installation status must not clone 101 MB just to render a button. The only
// writer verifies the model; the worker verifies it again before inference.
export const cutoutReady = () => transaction('readonly', (store, done) => { const request = store.count(CUTOUT_ID); request.onsuccess = () => done(request.result === 1); });
export async function saveCutout(buffer, signal) { await verifyCutout(buffer); signal?.throwIfAborted(); await transaction('readwrite', store => store.put(buffer, CUTOUT_ID)); }
export const deleteCutout = () => transaction('readwrite', store => store.clear());
