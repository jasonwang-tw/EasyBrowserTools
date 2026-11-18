export const MODEL_ORIGIN = 'https://paddle-model-ecology.bj.bcebos.com';
export const MODEL_PERMISSION = `${MODEL_ORIGIN}/*`;
export const MODEL_ID = 'pp-ocrv6-small-20261117';
export const MODEL_KEY = 'pagekitOcrEngine';
const base = `${MODEL_ORIGIN}/paddlex/official_inference_model/paddle3.0.0/`;
export const MODEL_FILES = Object.freeze([
  { key: 'det', url: `${base}PP-OCRv6_small_det_onnx_infer.tar`, bytes: 9891840, sha256: 'd218f6fbf0f1c23d2161bd6ac7f5eaa6104fa89955c09290497e31008e2618e4' },
  { key: 'rec', url: `${base}PP-OCRv6_small_rec_onnx_infer.tar`, bytes: 21319680, sha256: 'd267ab077a44a0eedb1ea8f8c542d263f211de8e9d7a029bf9fcfff7e5a88fb1' }
]);
export const MODEL_BYTES = MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0);
export async function verifyModel(buffer, file) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.bytes) throw new Error('模型大小不符，請重新下載');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== file.sha256) throw new Error('模型完整性驗證失敗，請重新下載');
}
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pagekit-ocr-models', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('models', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('模型儲存失敗，請確認磁碟空間'));
      try { action(tx.objectStore('models'), value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export function readModel() {
  return transact('readonly', (store, done) => { const request = store.get(MODEL_ID); request.onsuccess = () => done(request.result); });
}
export async function modelReady() {
  const record = await readModel();
  return Boolean(record && MODEL_FILES.every(file => record[file.key] instanceof ArrayBuffer && record[file.key].byteLength === file.bytes));
}
export async function saveModel(record, signal) {
  for (const file of MODEL_FILES) await verifyModel(record[file.key], file);
  signal?.throwIfAborted();
  // One transaction publishes both verified files. Partial downloads stay in RAM.
  await transact('readwrite', store => store.put(record, MODEL_ID));
}
export function deleteModel() { return transact('readwrite', store => store.clear()); }
