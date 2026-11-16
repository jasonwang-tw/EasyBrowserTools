import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { translateTextGoogle, fetchGoogleTTS, splitTextChunks, getTranslationDirection } from '../translation-service.js';

afterEach(() => mock.restoreAll());

test('沿用中文到英文、其他語言到繁中的方向', () => {
  assert.deepEqual(getTranslationDirection('你好'), { from: 'zh-TW', to: 'en' });
  assert.deepEqual(getTranslationDirection('Hello'), { from: 'auto', to: 'zh-TW' });
});

test('翻譯送出選取文字、合併多段結果且不附帶 Cookie', async () => {
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://translate.google.com');
    assert.equal(url.searchParams.get('q'), 'Hello & goodbye');
    assert.equal(url.searchParams.get('sl'), 'auto');
    assert.equal(url.searchParams.get('tl'), 'zh-TW');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json([[['你好'], ['與再見']]]);
  });
  assert.deepEqual(await translateTextGoogle(' Hello & goodbye '), {
    original: 'Hello & goodbye', translated: '你好與再見', from: 'auto', to: 'zh-TW'
  });
});

test('中文方向也套用於實際請求', async () => {
  mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.searchParams.get('sl'), 'zh-TW');
    assert.equal(url.searchParams.get('tl'), 'en');
    return Response.json([[['Hello']]]);
  });
  assert.equal((await translateTextGoogle('你好')).translated, 'Hello');
});

test('空白、非文字、過長輸入不發出網路請求', async () => {
  const request = mock.method(globalThis, 'fetch', () => { throw new Error('不應發出請求'); });
  for (const input of ['', '   ', null, {}, 'a'.repeat(5001)]) {
    await assert.rejects(translateTextGoogle(input));
  }
  assert.equal(request.mock.callCount(), 0);
});

test('服務錯誤、無效 JSON 結構及空結果都回報失敗', async () => {
  for (const response of [new Response('', { status: 429 }), Response.json({ error: 'bad' }), Response.json([[]])]) {
    mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(translateTextGoogle('hello'));
    mock.restoreAll();
  }
});

test('TTS 切段保留 Unicode 字元', () => {
  const text = 'a'.repeat(179) + '😀' + 'b'.repeat(180);
  const chunks = splitTextChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(chunk => Array.from(chunk).length <= 180));
  assert.ok(chunks.every(chunk => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test('TTS 分段請求並合併音訊資料', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/translate_tts');
    assert.equal(url.searchParams.get('tl'), 'en');
    assert.equal(options.credentials, 'omit');
    calls++;
    return new Response(new Uint8Array([calls]));
  });
  assert.equal(await fetchGoogleTTS('a'.repeat(181), 'en'), btoa('\x01\x02'));
  assert.equal(calls, 2);
});

test('TTS 拒絕無效語言並傳遞服務失敗', async () => {
  await assert.rejects(fetchGoogleTTS('hello', 'auto'), /朗讀語言/);
  mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(fetchGoogleTTS('hello', 'en'), /503/);
});
