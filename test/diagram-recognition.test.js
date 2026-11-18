import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLargeGraphic, diagramWords, stableDiagramWords, formatDiagramWords, mergeDiagramWords } from '../ocr/diagram-recognition.js';

function pixels(width, height, rectangles) {
  const value = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x0, y0, x1, y1] of rectangles) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) value.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return value;
}
const word = (text, x, y, confidence = 95, width = 40, height = 14) => ({ text, confidence, bbox: { x0: x, y0: y, x1: x + width, y1: y + height } });

test('比較圖偵測須有淺底與大型圖案，不將一般文字列或空白頁當成圖案', () => {
  const image = pixels(400, 300, [[50, 50, 180, 180]]), before = image.slice();
  assert.equal(hasLargeGraphic(image, 400, 300), true);
  assert.deepEqual(image, before);
  assert.equal(hasLargeGraphic(pixels(400, 300, [[10, 10, 300, 20], [10, 40, 320, 50]]), 400, 300), false);
  assert.equal(hasLargeGraphic(pixels(400, 300, []), 400, 300), false);
  assert.equal(hasLargeGraphic(pixels(400, 300, [[0, 0, 400, 300]]), 400, 300), false);
});

test('相同文字須位於相同區域，重複標籤不因文字相同而被刪除', () => {
  const first = [word('panel', 10, 10), word('panel', 200, 10)];
  assert.equal(stableDiagramWords(first, [word('panel', 200, 10)]).length, 1);
  assert.equal(stableDiagramWords(first, [...first].reverse()).length, 2);
  assert.equal(stableDiagramWords(first, [word('panel', 100, 100)]).length, 0);
});

test('略過不一致或低可信度的圖案，但保留原圖真正的人字與一致的小字單位', () => {
  const first = [word('人', 10, 10), word('nits', 60, 10, 83), word('a', 150, 100, 40)];
  const second = [word('人', 10, 10, 96), word('nits', 60, 10, 73), word('人', 150, 100, 40)];
  assert.deepEqual(stableDiagramWords(first, second).map(item => item.text), ['人', 'nits']);
  assert.equal(stableDiagramWords([word('假字', 10, 10, 79)], [word('假字', 10, 10, 79)]).length, 0);
});

test('獨立的圖案符號不輸出，文字旁合法的標點與單位符號保留', () => {
  const words = [word('500', 10, 10, 96, 30), word('%', 42, 10, 95, 10), word('~', 200, 100, 99, 20)];
  assert.deepEqual(stableDiagramWords(words, words).map(item => item.text), ['500', '%']);
});

test('依畫面位置重建文字行，分開同高度但相距很遠的標籤', () => {
  const words = [word('Normal', 10, 10, 95, 50), word('panel', 65, 10), word('AG', 250, 10, 95, 20), word('Neovo', 275, 10), word('500', 10, 100, 95, 25), word('nits', 40, 100), word('Anti-Glare', 250, 100)];
  assert.equal(formatDiagramWords(words), 'Normal panel\nAG Neovo\n\n500 nits\nAnti-Glare');
});

test('縮放後的字框還原原圖座標，中文校正結果沿用同一字框', () => {
  const original = word('FRE:', 20, 40, 60, 120, 40);
  const result = { data: { blocks: [{ paragraphs: [{ lines: [{ words: [original] }] }] }] }, recoveredWords: [{ bbox: original.bbox, text: '開發者:', confidence: 88 }] };
  const [restored] = diagramWords(result, 2);
  assert.equal(restored.text, '開發者:');
  assert.equal(restored.confidence, 88);
  assert.deepEqual(restored.bbox, { x0: 10, y0: 20, x1: 70, y1: 40 });
});

test('重疊區域採用可信度較高的同位置結果，保留其他位置的重複標籤', () => {
  const groups = [[word('500', 10, 100, 85), word('panel', 200, 10)], [word('500', 10, 100, 96), word('panel', 10, 10)]];
  const merged = mergeDiagramWords(groups);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(item => item.text === '500').confidence, 96);
  assert.equal(merged.filter(item => item.text === 'panel').length, 2);
});
