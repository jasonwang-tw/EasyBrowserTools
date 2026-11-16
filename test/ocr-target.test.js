import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../content/ocr-target.js', import.meta.url), 'utf8');
class Image {
  constructor(src, x = 10, y = 20) { this.src = this.currentSrc = src; this.x = x; this.y = y; this.isConnected = true; }
  getBoundingClientRect() { return { x: this.x, y: this.y, left: this.x, top: this.y, right: this.x + 100, bottom: this.y + 60, width: 100, height: 60 }; }
}
function tracker(images = [], frames = [], style = {}) {
  const runtime = [], documentEvents = new Map(), windowEvents = new Map();
  const eventSurface = events => ({ addEventListener: (type, listener) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(listener); }, removeEventListener: (type, listener) => events.get(type)?.delete(listener) });
  const window = { ...eventSurface(windowEvents), innerWidth: 800, innerHeight: 600, __easyBrowserOcrTarget: true };
  window.top = window.parent = window;
  const document = { ...eventSurface(documentEvents), querySelectorAll: selector => selector === 'img' ? images : selector === 'iframe,frame' ? frames : [...images, ...frames] };
  const context = { window, document, HTMLImageElement: Image, crypto: globalThis.crypto, setTimeout, clearTimeout, Uint32Array,
    getComputedStyle: () => ({ transform: 'none', ...style }),
    chrome: { runtime: { onMessage: { addListener: listener => runtime.push(listener), removeListener: listener => { const index = runtime.indexOf(listener); if (index >= 0) runtime.splice(index, 1); } } } } };
  const install = () => runInNewContext(script, context);
  install();
  return { window, install, runtime, click: image => [...documentEvents.get('contextmenu')][0]({ composedPath: () => [image] }),
    request: srcUrl => new Promise(resolve => runtime[0]({ type: 'OCR_IMAGE_RECT', srcUrl }, {}, resolve)),
    message: event => [...windowEvents.get('message')][0](event) };
}

test('更新後沒有右鍵記錄仍能依唯一圖片重新定位，不受舊 boolean guard 阻擋', async () => {
  const image = new Image('https://example.com/image.png');
  const agent = tracker([image]);
  const target = await agent.request(image.src);
  assert.deepEqual(JSON.parse(JSON.stringify(target)), { rect: { x: 10, y: 20, width: 100, height: 60 }, viewport: { width: 800, height: 600 } });
});

test('相同 URL 的多張圖片使用確切右鍵節點，沒有記錄時拒絕猜測', async () => {
  const images = [new Image('https://example.com/shared.png'), new Image('https://example.com/shared.png', 300, 200)];
  const agent = tracker(images);
  assert.match((await agent.request(images[0].src)).error, /多張相同圖片/);
  agent.click(images[1]);
  assert.equal((await agent.request(images[1].src)).rect.x, 300);
  agent.install();
  assert.equal(agent.runtime.length, 1);
  assert.equal((await agent.request(images[1].src)).rect.x, 300);
});

test('不沿用已失效或不同來源的圖片，並裁掉畫面外部分', async () => {
  const old = new Image('https://example.com/old.png'), current = new Image('https://example.com/current.png', -20, 40);
  const agent = tracker([old, current]);
  agent.click(old);
  const target = await agent.request(current.src);
  assert.equal(target.rect.x, 0);
  assert.equal(target.rect.width, 80);
  current.isConnected = false;
  assert.match((await agent.request(current.src)).error, /無法定位/);
});

test('父框架將子框架圖片座標依邊框與縮放換算到主頁面', async () => {
  let response;
  const child = { postMessage: message => { response = message; } };
  const frame = { contentWindow: child, offsetWidth: 404, offsetHeight: 204, clientWidth: 400, clientHeight: 200, clientLeft: 2, clientTop: 2,
    getBoundingClientRect: () => ({ x: 100, y: 50, width: 808, height: 408 }) };
  const agent = tracker([], [frame]);
  await agent.message({ source: child, data: { channel: 'easy-browser-image-coordinates-v1', type: 'request', token: 'test', target: { rect: { x: 10, y: 20, width: 100, height: 50 }, viewport: { width: 400, height: 200 } } } });
  assert.equal(response.target.rect.x, 124);
  assert.equal(response.target.rect.y, 94);
  assert.equal(response.target.rect.width, 200);
  assert.equal(response.target.rect.height, 100);
});

test('不接受非子框架來源的座標請求', async () => {
  let replies = 0;
  const agent = tracker();
  await agent.message({ source: { postMessage: () => replies++ }, data: { channel: 'easy-browser-image-coordinates-v1', type: 'request', token: 'test' } });
  assert.equal(replies, 0);
});
