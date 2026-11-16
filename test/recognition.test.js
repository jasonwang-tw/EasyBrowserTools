import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOcrPixels, recognizeCanvas, detectColumnSplit, findTextLines } from '../ocr/recognition.js';

test('深色海報轉為淺底，保留原始截圖像素不變', () => {
  const original = new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255, 250, 250, 250, 255]);
  const before = original.slice();
  const result = prepareOcrPixels(original);
  assert.equal(result.inverted, true);
  assert.ok(result.pixels[0] > 230);
  assert.equal(result.pixels[8], 5);
  assert.deepEqual(original, before);
});

test('白底文件與混合明暗圖片不自動反相，手動保留原圖可略過', () => {
  const mixed = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  assert.equal(prepareOcrPixels(mixed).inverted, false);
  assert.equal(prepareOcrPixels(mixed, 'original').pixels, mixed);
  assert.equal(prepareOcrPixels(mixed, 'dark').inverted, true);
  assert.equal(prepareOcrPixels(new Uint8ClampedArray([255, 255, 255, 255])).inverted, false);
});

test('透明區不當成深底，手動反相後透明處補白', () => {
  const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
  assert.equal(prepareOcrPixels(transparent).inverted, false);
  assert.deepEqual([...prepareOcrPixels(transparent, 'dark').pixels], [255, 255, 255, 255]);
});

test('每次辨識分別套用版面，不沿用上次設定，白底不重畫', async () => {
  const calls = [];
  const canvas = { width: 1, height: 1, getContext: () => ({
    getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
    putImageData: () => { throw new Error('不應重畫白底圖片'); }
  }) };
  const worker = {
    setParameters: async parameters => calls.push(parameters.tessedit_pageseg_mode),
    recognize: async image => { assert.equal(image, canvas); calls.push('recognize'); return { data: { text: 'United States\n第二行', confidence: 90 } }; }
  };
  for (const layout of ['auto', 'scattered', 'document']) {
    const result = await recognizeCanvas(worker, canvas, { layout });
    assert.equal(result.data.text, 'United States\n第二行');
  }
  assert.deepEqual(calls, ['3', 'recognize', '11', 'recognize', '6', 'recognize']);
});

test('無效選項及引擎錯誤會向上回報，不產生虛構結果', async () => {
  await assert.rejects(recognizeCanvas({}, {}, { layout: 'invalid' }), /不支援/);
  assert.throws(() => prepareOcrPixels(new Uint8ClampedArray(), 'invalid'), /不支援/);
  const canvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }) }) };
  await assert.rejects(recognizeCanvas({ setParameters: async () => {}, recognize: async () => { throw new Error('worker failed'); } }, canvas), /worker failed/);
});

function diagram(width, height, rectangles) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [left, top, right, bottom] of rectangles) for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
  }
  return pixels;
}

test('淺底彩色字以最小色彩通道強化，保留原圖模式及來源像素', () => {
  const pixels = new Uint8ClampedArray(40).fill(255);
  pixels.set([255, 136, 0, 255]);
  const original = pixels.slice();
  const result = prepareOcrPixels(pixels);
  assert.equal(result.colorEnhanced, true);
  assert.deepEqual([...result.pixels.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual(pixels, original);
  assert.equal(prepareOcrPixels(pixels, 'original').pixels, pixels);
});

test('雙欄須有寬中縫且兩邊都有內容，不切開跨欄標題或空白頁', () => {
  const rectangles = [[20, 80, 170, 240], [230, 80, 380, 240]];
  assert.equal(detectColumnSplit(diagram(400, 300, rectangles), 400, 300), 200);
  assert.equal(detectColumnSplit(diagram(400, 300, [...rectangles, [20, 10, 380, 30]]), 400, 300), null);
  assert.equal(detectColumnSplit(diagram(400, 300, [[20, 80, 170, 240]]), 400, 300), null);
  assert.equal(detectColumnSplit(diagram(400, 300, []), 400, 300), null);
});

test('圖文文字行不包含大面積產品圖片或細指示線，細字註腳保留', () => {
  const pixels = diagram(400, 300, [[20, 10, 140, 22], [20, 50, 150, 210], [80, 210, 81, 250], [30, 250, 140, 261], [40, 278, 150, 284]]);
  const lines = findTextLines(pixels, 400, 300, 0, 200);
  assert.equal(lines.length, 3);
  assert.ok(lines[0].y < 10 && lines[0].height >= 12);
  assert.ok(lines[1].y < 250 && lines[1].y > 240);
  assert.ok(lines[2].height >= 6);
});

test('分欄使用非重疊範圍，按左欄再右欄合併，不刪除兩邊相同的文字', async () => {
  const pixels = diagram(400, 300, [[20, 80, 170, 240], [230, 80, 380, 240]]);
  const regions = [], progress = [];
  const canvas = { width: 400, height: 300, getContext: () => ({ getImageData: () => ({ data: pixels }) }) };
  const worker = {
    setParameters: async () => {},
    recognize: async (_canvas, options) => { regions.push(options.rectangle); return { data: { text: 'Same phrase\n', confidence: 90 } }; }
  };
  const result = await recognizeCanvas(worker, canvas, { onSegment: (index, total) => progress.push([index, total]) });
  assert.equal(result.data.text, 'Same phrase\n\nSame phrase');
  assert.deepEqual(regions, [{ left: 0, top: 0, width: 200, height: 300 }, { left: 200, top: 0, width: 200, height: 300 }]);
  assert.deepEqual(progress, [[0, 2], [1, 2]]);
});
