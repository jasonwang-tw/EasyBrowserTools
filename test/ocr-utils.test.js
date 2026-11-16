import test from 'node:test';
import assert from 'node:assert/strict';
import { screenshotRect, normalizeOcrText } from '../ocr-utils.js';

test('HiDPI 與瀏覽器縮放依實際截圖尺寸換算', () => {
  assert.deepEqual(screenshotRect({ x: 10, y: 20, width: 100, height: 50 }, { width: 800, height: 600 }, 1600, 1200), {
    x: 20, y: 40, width: 200, height: 100
  });
});

test('整理使用者回報的中文字間空格與中文句中逗號', () => {
  assert.equal(normalizeOcrText('官網 產品 推 送 已 完成 , 並 通過 逐 語 系 回 讀 驗 證 。'), '官網產品推送已完成，並通過逐語系回讀驗證。');
});

test('混合產品清單保留英文詞組、數字與段落換行', () => {
  const text = '官網 產品 推 送 已 完成 。\n\n產品：PDS520\n推 送 語 系 ： Global · United States · UK\n推 送 欄 位 ：139 筆\nPanel Type · Aspect Ratio · Mini HDMI';
  assert.equal(normalizeOcrText(text), '官網產品推送已完成。\n\n產品：PDS520\n推送語系：Global · United States · UK\n推送欄位：139 筆\nPanel Type · Aspect Ratio · Mini HDMI');
});

test('中文模式不改寫英文字距、標點、版本號、小數或時間', () => {
  const text = 'United States, United Kingdom\nVersion 1.2.3: 1,234.56 USD at 14:30\nA  B\n1 2 3\n-3.5°C';
  assert.equal(normalizeOcrText(text), text);
});

test('保留 Tab、CRLF、空行與 Unicode 換行，不跨行合併漢字', () => {
  const text = '中文\t欄位\r\n第 一 行\r\n\r\n第 二 行\n  United States\u2028第 三 行\u2029末 行';
  assert.equal(normalizeOcrText(text), '中文\t欄位\r\n第一行\r\n\r\n第二行\n  United States\u2028第三行\u2029末行');
});

test('繁簡中文與擴展漢字皆可整理一般、NBSP 及全形空格', () => {
  assert.equal(normalizeOcrText('官 网\u00a0产 品\u3000推 送', 'chi_sim+eng'), '官网产品推送');
  assert.equal(normalizeOcrText('𠮷 田\u2009測 試'), '𠮷田測試');
});

test('英文辨識模式不整理中文，保留原本輸出', () => {
  assert.equal(normalizeOcrText('  中 文 , 測 試\nUnited States  ', 'eng'), '中 文 , 測 試\nUnited States');
});

test('中英交界的空格保持原樣，中文標點與句末才整理', () => {
  assert.equal(normalizeOcrText('中 文 API 說 明 : 測 試 。\n已 完 成 .'), '中文 API 說明：測試。\n已完成。');
  assert.equal(normalizeOcrText('台灣, United States\nPDS520 : 139'), '台灣, United States\nPDS520 : 139');
});

test('空結果保持空白且重複整理不改變結果', () => {
  assert.equal(normalizeOcrText(' \n\t '), '');
  const normalized = normalizeOcrText('官 網 已 完成 , 並 通 過 。\nUnited States, UK');
  assert.equal(normalizeOcrText(normalized), normalized);
});
test('部分超出畫面的圖片只裁切可見範圍', () => {
  assert.deepEqual(screenshotRect({ x: -20, y: 550, width: 100, height: 200 }, { width: 800, height: 600 }, 800, 600), {
    x: 0, y: 550, width: 80, height: 50
  });
});
test('拒絕畫面外、太小、無限或無效座標', () => {
  for (const rect of [null, { x: 900, y: 0, width: 100, height: 50 }, { x: 0, y: 0, width: 1, height: 1 }, { x: NaN, y: 0, width: 10, height: 20 }]) {
    assert.throws(() => screenshotRect(rect, { width: 800, height: 600 }, 800, 600));
  }
  assert.throws(() => screenshotRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 600 }, 800, 600));
});
