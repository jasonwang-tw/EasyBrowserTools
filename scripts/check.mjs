import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json')));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.background.type, 'module');
assert.deepEqual(manifest.permissions.slice().sort(), ['activeTab', 'contextMenus', 'scripting']);
assert.deepEqual(manifest.host_permissions, ['https://translate.google.com/*']);
assert.ok(!manifest.side_panel && !manifest.options_page);
for (const path of [manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(item => item.js)]) {
  assert.ok(existsSync(resolve(root, path)), `manifest 路徑不存在：${path}`);
}
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'output'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(path);
    else if (/\.(?:js|mjs)$/.test(entry.name)) execFileSync(process.execPath, ['--check', path]);
  }
}
checkDirectory(root);
const content = readFileSync(resolve(root, 'content/translate-popup.js'), 'utf8');
assert.ok(!/ADD_TO_VOCABULARY|add-vocabulary|chrome\.storage|Open Chat Hub/.test(content), 'content script 仍有原專案依賴');
console.log('Manifest、資源路徑、語法與拆分依賴檢查通過');
