// Maintenance only. Reuses the pinned ONNX Runtime WASM already shipped for OCR.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const revision = 'f01535dcce4c28a8688ee631ca15719b779b3f86';
const upstream = `https://huggingface.co/clevr-tools/birefnet-lite-web/resolve/${revision}`;
const modules = resolve(process.argv[2] || 'output/ocr-evaluation/runtime/node_modules');
if (JSON.parse(readFileSync(resolve(modules, 'onnxruntime-web/package.json'))).version !== '1.31.1') throw Error('Unexpected ONNX Runtime version');
const target = resolve('vendor/background-removal'); mkdirSync(target, { recursive: true });
copyFileSync(resolve(modules, 'onnxruntime-web/dist/ort.wasm.min.mjs'), resolve(target, 'ort.wasm.min.mjs'));
for (const name of ['LICENSE', 'NOTICE']) {
  const response = await fetch(`${upstream}/${name}`);
  if (!response.ok) throw Error(`License download failed: ${name}`);
  writeFileSync(resolve(target, name), await response.text());
}
const assets = Object.fromEntries(['ort.wasm.min.mjs', 'LICENSE', 'NOTICE'].map(name => [name, createHash('sha256').update(readFileSync(resolve(target, name))).digest('hex')]));
writeFileSync(resolve(target, 'sources.json'), JSON.stringify({ runtime: 'onnxruntime-web 1.31.1 (MIT)', runtimeLicense: '../paddle/licenses/onnxruntime-MIT.txt', runtimeWasm: '../paddle/ort/', upstream, revision, model: { name: 'BiRefNet Lite Web 512', bytes: 101066931, sha256: '20e3fb3e7bbb75e0b4f152759413a6ab19a599a1c2e1db7ce7741792eaf639fb', filename: 'birefnet_lite_512_fp16w.onnx', license: 'MIT' }, assets }, null, 2) + '\n');
console.log('Bundled local ONNX Runtime JS and model attribution; optional weights are excluded.');
