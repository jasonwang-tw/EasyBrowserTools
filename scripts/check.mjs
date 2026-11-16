import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json')));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.background.type, 'module');
assert.deepEqual(manifest.action.default_icon, manifest.icons);
for (const [size, path] of Object.entries(manifest.icons)) {
  const png = readFileSync(resolve(root, path));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `圖示不是 PNG：${path}`);
  assert.equal(png.readUInt32BE(16), Number(size), `圖示寬度不符：${path}`);
  assert.equal(png.readUInt32BE(20), Number(size), `圖示高度不符：${path}`);
}
assert.deepEqual(manifest.permissions.slice().sort(), ['activeTab', 'clipboardWrite', 'contextMenus', 'scripting', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://translate.google.com/*']);
assert.ok(!manifest.side_panel && !manifest.options_page);
assert.equal(manifest.commands['capture-region'].suggested_key.default, 'Alt+Shift+S');
for (const path of [manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(item => item.js), 'content/screenshot-region.js', 'ocr/annotation-editor.js', 'ocr/recognition.js', 'ocr/cjk-recovery.js', 'ocr/ocr.html', 'ocr/ocr.js', 'ocr/ocr.css']) {
  assert.ok(existsSync(resolve(root, path)), `manifest 路徑不存在：${path}`);
}
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'output', 'vendor'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(path);
    else if (/\.(?:js|mjs)$/.test(entry.name)) execFileSync(process.execPath, ['--check', path]);
  }
}
checkDirectory(root);
const content = readFileSync(resolve(root, 'content/translate-popup.js'), 'utf8');
assert.ok(!/ADD_TO_VOCABULARY|add-vocabulary|chrome\.storage|Open Chat Hub/.test(content), 'content script 仍有原專案依賴');
assert.ok(content.includes(`${manifest.version}-easy-browser-tools`), '注入版本必須一致');
assert.ok(manifest.content_security_policy.extension_pages.includes("'wasm-unsafe-eval'"));
assert.ok(!manifest.web_accessible_resources, 'OCR 僅在擴充功能頁執行，不公開資源給網頁');
const vendor = JSON.parse(readFileSync(resolve(root, 'vendor/ocr/sources.json')));
for (const [path, hash] of Object.entries(vendor.assets)) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, 'vendor/ocr', path))).digest('hex'), hash, `OCR 資源異動：${path}`);
}
assert.equal(Object.keys(vendor.assets).filter(path => path.endsWith('.traineddata.gz')).length, 3);
assert.equal(Object.keys(vendor.assets).filter(path => path.endsWith('-lstm.wasm.js')).length, 3);
console.log('Manifest、資源路徑、語法、版本與本機 OCR 資源完整性檢查通過');
