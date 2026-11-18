import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPreviewWidth } from '../ocr/editor-layout.js';

test('橫圖以寬度、直圖以高度縮放預覽，仍保留原始圖片比例', () => {
  assert.equal(fitPreviewWidth(1600, 900, 800, 600), 800);
  assert.equal(fitPreviewWidth(600, 1200, 800, 600), 300);
  assert.equal(fitPreviewWidth(300, 150, 800, 600), 800);
  for (const [w,h] of [[761,521],[308,341],[1065,561],[2000,100],[100,2000]]) {
    const result = fitPreviewWidth(w,h,650,480);
    assert.ok(result <= 650 && result * h / w <= 480);
  }
});
test('尚未載入、零尺寸與無效尺寸不產生無限寬或負值', () => {
  for (const value of [0, -1, Infinity, NaN, undefined]) assert.equal(fitPreviewWidth(100,100,value,400), 0);
  assert.equal(fitPreviewWidth(0,100,400,400), 0);
});
