import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePalette, paletteSize, MAX_PALETTE_PIXELS, PALETTE_COUNTS } from '../ocr/palette-analysis.js';
import { strokeRange, clampStrokeWidth } from '../ocr/stroke-settings.js';
import { strokeWidth } from '../ocr/brush-cursor.js';

// Node has no browser ImageData. Keep the real vendor quantizer, providing only
// the pixel container it consumes; browser QA exercises native ImageData.
globalThis.ImageData = class ImageData { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
function pixels(colors) { return { data: new Uint8ClampedArray(colors.flat()), width: colors.length, height: 1 }; }
test('色票保留黑白及精確純色，不湊足指定色數', () => {
  const result = analyzePalette(pixels([[255,255,255,255], [255,255,255,255], [0,0,0,255], [255,0,0,255]]));
  assert.deepEqual(result.map(x => [x.hex, x.percent]), [['#FFFFFF',50],['#000000',25],['#FF0000',25]]);
  assert.deepEqual(result.at(-1).rgb, [255,0,0]);
});
test('完全透明像素不產生色票或影響占比', () => {
  assert.deepEqual(analyzePalette(pixels([[255,0,255,0], [0,255,0,0]])), []);
  assert.deepEqual(analyzePalette(pixels([[255,0,255,0], [0,255,0,255]])), [{hex:'#00FF00',rgb:[0,255,0],percent:100}]);
});
test('半透明像素以 alpha 加權而非染上預覽棋盤', () => {
  const result = analyzePalette(pixels([[255,0,0,255], [0,0,255,85]]));
  assert.equal(result[0].hex, '#FF0000'); assert.equal(result[0].percent, 75);
  assert.equal(result[1].hex, '#0000FF'); assert.equal(result[1].percent, 25);
});
test('不同代表色數可分析漸層並保留完整占比及合法色碼', () => {
  const source = pixels(Array.from({length:256}, (_, n) => [n, (n*3)%256,255-n,255]));
  const before = source.data.slice();
  for (const count of PALETTE_COUNTS) {
    const colors = analyzePalette(source, count);
    assert.ok(colors.length > 1 && colors.length <= count);
    assert.ok(Math.abs(colors.reduce((sum,x) => sum+x.percent,0)-100) < 1e-9);
    assert.equal(new Set(colors.map(x => x.hex)).size, colors.length);
    for (const x of colors) { assert.match(x.hex,/^#[0-9A-F]{6}$/); assert.ok(x.percent>0); assert.ok(x.rgb.every(c=>Number.isInteger(c)&&c>=0&&c<=255)); }
  }
  assert.deepEqual(source.data,before);
});
test('已知三色面積以原始取樣像素歸類，順序依占比', () => {
  const result = analyzePalette(pixels([...Array(70).fill([10,40,80,255]), ...Array(20).fill([240,180,30,255]), ...Array(10).fill([230,230,230,255])]), 3);
  assert.deepEqual(result.map(x => x.percent), [70,20,10]);
  assert.deepEqual(result.map(x => x.hex), ['#0A2850','#F0B41E','#E6E6E6']);
});
test('空圖、非限定色數與超過像素上限的工作被拒絕', () => {
  assert.throws(()=>analyzePalette(pixels([[0,0,0,255]]), 4), /數量/);
  assert.throws(()=>analyzePalette({data:new Uint8ClampedArray(),width:0,height:0}), /資料/);
  assert.throws(()=>analyzePalette({data:new Uint8ClampedArray(4),width:2,height:1}), /資料/);
  assert.throws(()=>analyzePalette({data:new Uint8ClampedArray((MAX_PALETTE_PIXELS+1)*4),width:MAX_PALETTE_PIXELS+1,height:1}), /資料/);
});
test('取樣保留小圖尺寸並限制大圖像素量及長寬比', () => {
  assert.deepEqual(paletteSize(80,40),{width:80,height:40});
  for (const [w,h] of [[4000,4000],[16000,1000],[1000,16000],[16384,1]]) {
    const s=paletteSize(w,h); assert.ok(s.width*s.height<=MAX_PALETTE_PIXELS); assert.ok(s.width>0&&s.height>0); assert.ok(s.width<=w&&s.height<=h);
  }
  assert.throws(()=>paletteSize(0,100)); assert.throws(()=>paletteSize(2.5,10));
});
test('拉桿邊界、整數與各工具預設值', () => {
  assert.deepEqual(strokeRange('highlight'),{min:8,max:60,initial:20});
  for (const tool of ['pen','rect','arrow']) {
    assert.deepEqual(strokeRange(tool),{min:1,max:30,initial:3});
    assert.equal(clampStrokeWidth(tool,0),1); assert.equal(clampStrokeWidth(tool,99),30); assert.equal(clampStrokeWidth(tool,4.7),5); assert.equal(clampStrokeWidth(tool,NaN),3);
  }
  assert.equal(clampStrokeWidth('highlight',1),8); assert.equal(clampStrokeWidth('highlight',99),60); assert.equal(clampStrokeWidth('highlight',NaN),20);
});
test('繪圖與指標共用目前螢光筆寬，不影響一般線寬', () => {
  assert.equal(strokeWidth('pen',30,60),30); assert.equal(strokeWidth('highlight',3,8),8); assert.equal(strokeWidth('highlight',30,60),60); assert.equal(strokeWidth('highlight',3),20);
});
