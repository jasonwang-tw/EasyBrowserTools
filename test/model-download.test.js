import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadModels, isModelPage, installModelService } from '../ocr/model-download.js';
import { MODEL_FILES, MODEL_BYTES, verifyModel } from '../ocr/model-store.js';
import { paddleResult } from '../ocr/paddle-result.js';

test('模型驗證同時核對大小與 SHA-256，不接受同大小損壞資料', async () => {
  const bytes = new TextEncoder().encode('abc').buffer;
  const file = { bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };
  await verifyModel(bytes, file);
  await assert.rejects(verifyModel(bytes.slice(1), file), /大小/);
  await assert.rejects(verifyModel(new ArrayBuffer(3), file), /完整性/);
});
const complete = () => {
  let index = 0;
  return async (url, options) => {
    const file = MODEL_FILES[index++];
    assert.equal(url, file.url); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return new Response(new Uint8Array(file.bytes));
  };
};
test('兩個模型完整下載後才執行一次原子儲存，進度包含兩個檔案', async () => {
  let saves = 0, last;
  await downloadModels({ signal: new AbortController().signal, fetcher: complete(), progress: state => { last = state; }, save: async record => {
    saves++; for (const f of MODEL_FILES) assert.equal(record[f.key].byteLength, f.bytes);
  } });
  assert.equal(saves, 1); assert.deepEqual(last, { received: MODEL_BYTES, total: MODEL_BYTES });
});
test('下載第二檔失敗、截斷、超長或取消都不保存半套模型', async () => {
  for (const mode of ['network', 'short', 'oversized', 'cancel']) {
    const controller = new AbortController(); let index = 0;
    await assert.rejects(downloadModels({ signal: controller.signal, fetcher: async () => {
      if (index++ === 0) return new Response(new Uint8Array(MODEL_FILES[0].bytes));
      if (mode === 'network') throw new Error('offline');
      if (mode === 'cancel') controller.abort();
      return new Response(new Uint8Array(mode === 'oversized' ? MODEL_FILES[1].bytes + 1 : 10));
    }, save: async () => assert.fail('不可發布半套或取消的下載') }));
  }
});
test('拒絕 HTTP 錯誤、既已取消的工作與損壞的下載，不建立 IndexedDB 紀錄', async () => {
  await assert.rejects(downloadModels({ signal: new AbortController().signal, fetcher: async () => new Response('oops', { status: 503 }) }), /503/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(downloadModels({ signal: controller.signal, fetcher: () => assert.fail('不可開始下載') }));
  await assert.rejects(downloadModels({ signal: new AbortController().signal, fetcher: complete() }), /完整性/);
});
test('模型端點只接受自己的編輯頁，網頁 content script 及其他擴充功能均拒絕', () => {
  const runtime = { id: 'pagekit', getURL: path => `chrome-extension://pagekit/${path}` };
  assert.equal(isModelPage({ id: 'pagekit', url: runtime.getURL('ocr/ocr.html#job') }, runtime), true);
  for (const sender of [{ id: 'other', url: runtime.getURL('ocr/ocr.html') }, { id: 'pagekit', url: 'https://example.com/ocr/ocr.html' }, { id: 'pagekit', url: runtime.getURL('ocr/ocr.html.fake') }, {}]) assert.equal(isModelPage(sender, runtime), false);
});
test('沒有下載權限時回報錯誤，不發出模型請求，斷線也會取消', async () => {
  let connect; const responses = [];
  const runtime = { id: 'pk', getURL: path => `chrome-extension://pk/${path}`, onMessage: { addListener() {} }, onConnect: { addListener(fn) { connect = fn; } } };
  installModelService({ runtime, permissions: { contains: async () => false } });
  let receive, disconnect;
  connect({ name: 'pagekit-model-download', sender: { id: 'pk', url: runtime.getURL('ocr/ocr.html') }, postMessage: data => responses.push(data), onMessage: { addListener(fn) { receive = fn; } }, onDisconnect: { addListener(fn) { disconnect = fn; } } });
  receive({ type: 'START' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(responses[0].type, 'ERROR'); assert.match(responses[0].error, /尚未允許/);
  disconnect();
});
test('Paddle 文字依座標排序，重複標籤保留；手動雙欄以左欄再右欄排列', () => {
  const item = (text, x, y, score = .95) => ({ text, score, poly: [[x,y],[x+30,y],[x+30,y+10],[x,y+10]] });
  const input = { items: [item('右上', 120, 0), item('左下', 0, 40), item('左上', 0, 0), item('重複', 120, 40), item('重複', 0, 80, .5)] };
  assert.equal(paddleResult(input).data.text, '左上 右上\n左下 重複\n重複');
  assert.equal(paddleResult(input, true, 200).data.text, '左上\n左下\n重複\n右上\n重複');
  assert.equal(paddleResult(input).needsReview, true);
  assert.equal(paddleResult({ items: [] }).data.text, '');
});

test('下載服務禁止多視窗重複開始與中途刪除，斷線取消後可重試及切換偏好', async () => {
  let connect, message, finish, downloadCount = 0, removed = 0;
  const preferences = [];
  const runtime = { id: 'pk', getURL: path => `chrome-extension://pk/${path}`, onMessage: { addListener(fn) { message = fn; } }, onConnect: { addListener(fn) { connect = fn; } } };
  installModelService({ runtime, permissions: { contains: async () => true }, storage: { local: { set: async value => preferences.push(value) } } }, {
    ready: async () => true, remove: async () => { removed++; },
    download: ({ signal }) => new Promise((resolve, reject) => { downloadCount++; finish = resolve; signal.addEventListener('abort', () => reject(signal.reason)); })
  });
  const sender = { id: 'pk', url: runtime.getURL('ocr/ocr.html') };
  function port() {
    const result = [];
    const p = { name: 'pagekit-model-download', sender, postMessage: value => result.push(value), onMessage: { addListener(fn) { p.receive = fn; } }, onDisconnect: { addListener(fn) { p.close = fn; } } };
    connect(p); return { ...p, result };
  }
  const first = port(), second = port();
  first.receive({ type: 'START' }); await new Promise(resolve => setImmediate(resolve));
  second.receive({ type: 'START' }); assert.match(second.result[0].error, /其他視窗/);
  const deletion = await new Promise(resolve => { assert.equal(message({ type: 'MODEL_DELETE' }, sender, resolve), true); });
  assert.equal(deletion.success, false); assert.equal(removed, 0);
  first.close(); await new Promise(resolve => setImmediate(resolve));
  assert.match(first.result[0].error, /取消/); assert.equal(preferences.length, 0);
  second.receive({ type: 'START' }); await new Promise(resolve => setImmediate(resolve));
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(downloadCount, 2); assert.equal(second.result.at(-1).type, 'DONE');
  assert.deepEqual(preferences.at(-1), { pagekitOcrEngine: 'enhanced' });
  const done = await new Promise(resolve => { message({ type: 'MODEL_DELETE' }, sender, resolve); });
  assert.equal(done.success, true); assert.equal(removed, 1);
  assert.deepEqual(preferences.at(-1), { pagekitOcrEngine: 'standard' });
});
