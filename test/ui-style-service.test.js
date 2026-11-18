import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiStyleLoader } from '../ui-style-service.js';

test('本機 UI 樣式只讀取固定三檔，跨工具共用一次載入且不接受外部網址', async () => {
  const urls = [];
  const load = createUiStyleLoader(path => `chrome-extension://pagekit/${path}`, async url => {
    urls.push(url); return new Response(`/* ${url} */`);
  });
  const [first, second] = await Promise.all([load(), load()]);
  assert.deepEqual(first, second);
  assert.equal((await load()).css, first.css);
  assert.deepEqual(urls, ['chrome-extension://pagekit/vendor/ui/daisyui.css', 'chrome-extension://pagekit/ocr/ui-theme.css', 'chrome-extension://pagekit/content/ui-components.css']);
});
test('樣式檔失敗不發布半套 CSS，後續工具可以重新載入', async () => {
  let unavailable = true, calls = 0;
  const load = createUiStyleLoader(path => path, async path => {
    calls++;
    if (unavailable && path.endsWith('ui-theme.css')) return new Response('missing', {status:404});
    return new Response(path);
  });
  await assert.rejects(load(), /無法載入本機 UI/);
  unavailable = false;
  assert.match((await load()).css, /ui-theme.css/);
  assert.equal(calls, 6);
});
