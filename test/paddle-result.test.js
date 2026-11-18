import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paddleResult } from '../ocr/paddle-result.js';
const item = (text, score, x, y, width = 20, height = 16) => ({ text, score, poly: [[x,y],[x+width,y],[x+width,y+height],[x,y+height]] });
const captions = [item('Magnetic', .99, 80, 80, 60), item('Attachment', .99, 78, 98, 70)];

test('附圖實際模型結果略過圖示上的 l 與極小 1，完整保留八行說明及來源資料', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/paddle-icon-noise.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(raw);
  const result = paddleResult(raw);
  assert.equal(result.data.text, 'Magnetic\nAttachment\nDongle Free\nInstallation\nTilt and Pressure\nSensitivity\nRemote\nPresentation');
  assert.equal(result.filteredCount, 2);
  assert.equal(result.needsReview, true);
  assert.equal(JSON.stringify(raw), before);
  const restored = paddleResult(raw, false, 761, { includeUncertain: true });
  assert.equal(restored.filteredCount, 0);
  assert.match(restored.data.text, /^1\nMagnetic/);
  assert.match(restored.data.text, /\nl\nRemote/);
});

test('孤立、近方形、低分短字視為可還原候選，不依 la 或特定字串過濾', () => {
  for (const fragment of ['la', 'l', 'q7', 'ab']) {
    const result = paddleResult([...captions, item(fragment, .37, 95, 35)]);
    assert.equal(result.filteredCount, 1, fragment);
    assert.equal(result.data.text, 'Magnetic\nAttachment');
    assert.match(paddleResult([...captions, item(fragment, .37, 95, 35)], false, 0, { includeUncertain: true }).data.text, new RegExp('^'+fragment+'\n'));
  }
});

test('保留正常短字、數字、中文、長詞與非圖案比例，不以長度或低分一概刪除', () => {
  for (const entry of [item('la', .9, 90, 35), item('A', .95, 90, 35), item('5', .3, 90, 35), item('12', .4, 90, 35), item('人', .2, 90, 35), item('English', .3, 90, 35, 75), item('la', .3, 90, 35, 85), item('A', .3, 90, 35, 50, 60)]) {
    assert.equal(paddleResult([...captions, entry]).filteredCount, 0, entry.text);
  }
});

test('文字行中的低分短詞、單位及清單編號保留；垂直相鄰的圖示不當成同行', () => {
  for (const entry of [item('la', .3, 55, 80, 18), item('m', .25, 145, 80, 12), item('1', .2, 62, 80, 6, 6)]) {
    assert.equal(paddleResult([...captions, entry]).filteredCount, 0, entry.text);
  }
  assert.equal(paddleResult([...captions, item('la', .3, 90, 40)]).filteredCount, 1);
});

test('沒有足夠可靠正文時保留所有低分候選，避免短標籤或純數字圖片變空白', () => {
  const entries = [item('la', .3, 80, 20), item('1', .2, 80, 60, 5, 5)];
  assert.equal(paddleResult(entries).data.text, 'la\n1');
  assert.equal(paddleResult([...entries, ...captions.slice(0,1)]).filteredCount, 0);
});

test('雙欄與還原模式仍維持閱讀順序、重複標籤及有效座標', () => {
  const raw = [...captions, item('la', .3, 95, 35), item('Magnetic', .99, 240, 80, 60), item('bad', .99, NaN, 0)];
  assert.equal(paddleResult(raw, true, 400).data.text, 'Magnetic\nAttachment\nMagnetic');
  assert.equal(paddleResult(raw, true, 400, { includeUncertain: true }).data.text, 'la\nMagnetic\nAttachment\nMagnetic');
});
