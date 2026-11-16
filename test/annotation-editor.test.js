import test from 'node:test';
import assert from 'node:assert/strict';
import { AnnotationEditor } from '../ocr/annotation-editor.js';

function setup() {
  const context = new Proxy({ measureText: text => ({ width: text.length * 12 }) }, { get: (object, key) => object[key] ?? (() => {}) });
  const canvas = {
    style: {}, getContext: () => context, addEventListener() {},
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 250 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false
  };
  const editor = new AnnotationEditor(canvas, { width: 1000, height: 500 }, () => {});
  const pointer = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {} });
  return { editor, pointer };
}

test('編號依點選順序新增，縮放後座標仍對應圖片位置', () => {
  const { editor, pointer } = setup();
  editor.tool = 'number';
  editor.begin(pointer(200, 150));
  editor.begin(pointer(400, 200));
  assert.deepEqual(editor.items.map(item => item.number), [1, 2]);
  assert.deepEqual(editor.items[0].start, { x: 200, y: 200 });
  assert.equal(editor.nextNumber, 3);
  editor.undo();
  assert.equal(editor.nextNumber, 2);
  editor.redo();
  assert.equal(editor.nextNumber, 3);
});

test('拖曳編號保留號碼，復原與重做能還原位置', () => {
  const { editor, pointer } = setup();
  editor.tool = 'number';
  editor.begin(pointer(200, 150));
  editor.begin(pointer(200, 150));
  editor.end(pointer(350, 200));
  assert.equal(editor.items.length, 1);
  assert.equal(editor.items[0].number, 1);
  assert.deepEqual(editor.items[0].start, { x: 500, y: 300 });
  editor.undo();
  assert.deepEqual(editor.items[0].start, { x: 200, y: 200 });
  editor.redo();
  assert.deepEqual(editor.items[0].start, { x: 500, y: 300 });
});

test('文字可拖曳至另一位置，取消拖曳不修改已儲存標註', () => {
  const { editor, pointer } = setup();
  editor.tool = 'text';
  editor.commit({ tool: 'text', color: '#ef4444', start: { x: 200, y: 200 }, fontSize: 24, text: '標註文字' });
  editor.begin(pointer(210, 155));
  editor.move(pointer(300, 200));
  editor.cancel();
  assert.deepEqual(editor.items[0].start, { x: 200, y: 200 });
  editor.begin(pointer(210, 155));
  editor.end(pointer(300, 200));
  assert.deepEqual(editor.items[0].start, { x: 380, y: 290 });
  assert.equal(editor.items[0].text, '標註文字');
  editor.undo();
  assert.deepEqual(editor.items[0].start, { x: 200, y: 200 });
});

test('編號圓點在邊緣仍留在圖片內，新編號會中斷重做歷史', () => {
  const { editor, pointer } = setup();
  editor.tool = 'number';
  editor.begin(pointer(100, 50));
  const first = editor.items[0];
  assert.equal(first.start.x, first.radius);
  assert.equal(first.start.y, first.radius);
  editor.begin(pointer(500, 250));
  editor.undo();
  editor.begin(pointer(300, 150));
  editor.redo();
  assert.deepEqual(editor.items.map(item => item.number), [1, 2]);
  assert.equal(editor.redoItems.length, 0);
});

test('可選取並刪除中間編號，其他編號與位置保持不變，且可復原重做', () => {
  const { editor, pointer } = setup();
  editor.tool = 'number';
  for (const x of [200, 300, 400]) editor.begin(pointer(x, 150));
  const [first, , third] = editor.items;
  editor.begin(pointer(300, 150));
  editor.end(pointer(300, 150));
  assert.equal(editor.selectedItem.number, 2);
  assert.equal(editor.deleteSelected(), true);
  assert.deepEqual(editor.items, [first, third]);
  assert.equal(editor.nextNumber, 4);
  assert.equal(editor.selectedItem, null);
  editor.undo();
  assert.deepEqual(editor.items.map(item => item.number), [1, 2, 3]);
  editor.redo();
  assert.deepEqual(editor.items, [first, third]);
});

test('剛放置的編號可直接刪除，下一個編號正確更新', () => {
  const { editor, pointer } = setup();
  editor.tool = 'number';
  editor.begin(pointer(200, 150));
  editor.begin(pointer(400, 150));
  assert.equal(editor.selectedItem.number, 2);
  editor.deleteSelected();
  assert.equal(editor.nextNumber, 2);
  assert.deepEqual(editor.items.map(item => item.number), [1]);
});

test('未選取、取消選取或編輯停用時不刪除任何標註', () => {
  const { editor, pointer } = setup();
  assert.equal(editor.deleteSelected(), false);
  editor.tool = 'number';
  editor.begin(pointer(200, 150));
  editor.disabled = true;
  assert.equal(editor.deleteSelected(), false);
  editor.disabled = false;
  editor.cancel();
  assert.equal(editor.deleteSelected(), false);
  assert.equal(editor.items.length, 1);
});

test('刪除移動中的選取文字可復原，原圖來源不改變', () => {
  const { editor, pointer } = setup();
  const source = editor.source;
  editor.tool = 'text';
  editor.commit({ tool: 'text', color: '#ef4444', start: { x: 200, y: 200 }, fontSize: 24, text: '待刪除文字' });
  editor.begin(pointer(210, 155));
  editor.move(pointer(300, 200));
  assert.equal(editor.deleteSelected(), true);
  assert.equal(editor.items.length, 0);
  editor.undo();
  assert.equal(editor.items[0].text, '待刪除文字');
  assert.deepEqual(editor.items[0].start, { x: 200, y: 200 });
  assert.equal(editor.source, source);
});
