import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredTextLines, leadingBullet, blueUnderlineRows, withoutBlueUnderline, thresholdDarkRow } from '../ocr/text-layout.js';

function image(width, height, rectangles = [], color = [0, 0, 0, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [left, top, right, bottom] of rectangles) for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixels.set(color, (y * width + x) * 4);
  return pixels;
}

test('分隔清楚的清單逐行處理，連續段落與包含未覆蓋照片區域的圖片維持原流程', () => {
  const lines = [[20, 10, 150, 20], [20, 45, 130, 55], [20, 80, 160, 90], [20, 115, 140, 125], [20, 150, 130, 176]];
  assert.equal(structuredTextLines(image(200, 180, lines), 200, 180).length, 5);
  assert.equal(structuredTextLines(image(200, 180, [[20, 10, 160, 20], [20, 22, 160, 32], [20, 34, 160, 44], [20, 46, 160, 56]]), 200, 180), null);
  assert.equal(structuredTextLines(image(200, 360, [...lines, [20, 185, 180, 350]]), 200, 360), null);
  assert.equal(structuredTextLines(image(200, 180), 200, 180), null);
});

test('外緣長直線不混入每行字框，來源像素保持不變', () => {
  const pixels = image(200, 180, [[199, 0, 200, 180], [20, 10, 150, 20], [20, 45, 130, 55], [20, 80, 160, 90], [20, 115, 140, 125], [20, 150, 130, 176]]);
  const before = pixels.slice(), lines = structuredTextLines(pixels, 200, 180);
  assert.equal(lines.length, 5);
  assert.ok(lines.every(line => line.x + line.width < 180));
  assert.deepEqual(pixels, before);
});

test('沒有對齊圓點或實色按鈕的寬行距段落保留整頁辨識，避免破壞斜體中文校正', () => {
  const letters = [];
  for (const y of [10, 45, 80, 115, 150]) for (let x = 20; x < 150; x += 12) letters.push([x, y, x + 6, y + 10]);
  assert.equal(structuredTextLines(image(200, 180, letters), 200, 180), null);
});

test('只將行首居中的實心小圓形視為清單圓點，不將句點或一般字母當成圓點', () => {
  const words = [[18, 2, 28, 15], [33, 2, 50, 15]];
  assert.equal(leadingBullet(image(60, 18, [[2, 6, 7, 11], ...words]), 60, 18).left, 18);
  assert.equal(leadingBullet(image(60, 18, [[2, 13, 5, 16], ...words]), 60, 18), null);
  assert.equal(leadingBullet(image(60, 18, [[2, 2, 12, 15], ...words]), 60, 18), null);
  assert.equal(leadingBullet(image(60, 18), 60, 18), null);
});

test('底部細藍線可產生去底線候選，黑字筆畫與厚藍色底不當成底線', () => {
  const blue = [80, 100, 240, 255];
  assert.deepEqual(blueUnderlineRows(image(100, 20, [[5, 17, 95, 19]], blue), 100, 20), [17, 18]);
  assert.deepEqual(blueUnderlineRows(image(100, 20, [[5, 17, 95, 19]]), 100, 20), []);
  assert.deepEqual(blueUnderlineRows(image(100, 20, [[0, 0, 100, 20]], blue), 100, 20), []);
});

test('移除底線候選仍保留延伸至底線下方的筆畫，不修改來源或原始字串', () => {
  const width = 100, height = 20;
  const original = image(width, height, [[5, 16, 95, 18], [30, 10, 33, 20]], [80, 100, 240, 255]);
  const gray = image(width, height, [[5, 16, 95, 18], [30, 10, 33, 20]]), before = gray.slice();
  const cleaned = withoutBlueUnderline(gray, original, width, height, [16, 17]);
  assert.equal(cleaned[(16 * width + 10) * 4], 255);
  assert.equal(cleaned[(16 * width + 31) * 4], 0);
  assert.deepEqual(gray, before);
});

test('深底按鈕反相後的灰底與文字分離，淺灰背景不殘留為大黑框', () => {
  const gray = image(100, 40);
  for (let i = 0; i < gray.length; i += 4) gray[i] = gray[i + 1] = gray[i + 2] = 165;
  for (let y = 10; y < 30; y++) for (let x = 20; x < 80; x++) {
    const i = (y * 100 + x) * 4; gray[i] = gray[i + 1] = gray[i + 2] = 30;
  }
  const before = gray.slice(), binary = thresholdDarkRow(gray);
  assert.equal(binary[0], 255);
  assert.equal(binary[(20 * 100 + 30) * 4], 0);
  assert.deepEqual(gray, before);
});
