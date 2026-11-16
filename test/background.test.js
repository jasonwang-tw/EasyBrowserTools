import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
const injections = [];
const messages = [];
const menus = [];
const event = name => ({ addListener: listener => { listeners[name] = listener; } });
globalThis.chrome = {
  runtime: { id: 'test-extension', onInstalled: event('installed'), onMessage: event('message') },
  contextMenus: {
    onClicked: event('context'),
    removeAll: done => { menus.length = 0; done(); },
    create: menu => menus.push(menu)
  },
  action: { onClicked: event('action') },
  scripting: { executeScript: async data => injections.push(data) },
  tabs: { sendMessage: async (...args) => messages.push(args) }
};
await import('../background.js');
afterEach(() => { mock.restoreAll(); injections.length = 0; messages.length = 0; });

test('安裝時只註冊翻譯選單', () => {
  listeners.installed();
  assert.equal(menus.length, 1);
  assert.equal(menus[0].id, 'instant-translate');
  assert.deepEqual(menus[0].contexts, ['selection']);
});

test('右鍵入口保留點選的 frame，先注入再送出文字', async () => {
  await listeners.context({ menuItemId: 'instant-translate', frameId: 7, selectionText: ' Hello ' }, { id: 12 });
  assert.deepEqual(injections[0].target, { tabId: 12, frameIds: [7] });
  assert.deepEqual(messages[0], [12, { type: 'TRANSLATE_SELECTION', data: { text: 'Hello' } }, { frameId: 7 }]);
});

test('工具列入口請內容腳本使用目前選取文字', async () => {
  await listeners.action({ id: 3 });
  assert.equal(messages[0][1].type, 'TRANSLATE_SELECTION');
  assert.equal(messages[0][1].data.text, undefined);
});

test('不處理未知訊息或其他擴充功能訊息', () => {
  const fail = () => assert.fail('不應回覆');
  assert.equal(listeners.message({ type: 'ADD_TO_VOCABULARY' }, { id: chrome.runtime.id }, fail), false);
  assert.equal(listeners.message({ type: 'TRANSLATE_WORD' }, { id: 'other-extension' }, fail), false);
});

function send(message) {
  return new Promise(resolve => {
    assert.equal(listeners.message(message, { id: chrome.runtime.id }, resolve), true);
  });
}

test('翻譯非同步回覆可直接交給浮窗顯示', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json([[['你好']]]));
  assert.deepEqual(await send({ type: 'TRANSLATE_WORD', data: { text: 'Hello' } }), {
    success: true, original: 'Hello', translated: '你好', from: 'auto', to: 'zh-TW'
  });
});

test('無效輸入與逾時回傳明確錯誤', async () => {
  assert.equal((await send({ type: 'TRANSLATE_WORD' })).success, false);
  mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'TimeoutError'); });
  assert.deepEqual(await send({ type: 'TRANSLATE_WORD', data: { text: 'hello' } }), {
    success: false, error: '服務連線逾時，請稍後再試'
  });
});

test('朗讀訊息回傳音訊且不需要原專案儲存或 provider', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1, 2])));
  assert.deepEqual(await send({ type: 'TTS_FETCH', data: { text: 'Hello', lang: 'en' } }), {
    success: true, base64: btoa('\x01\x02')
  });
});
