// Maintainer-only download; normal use is entirely offline. No npm install/build.
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../vendor/ocr');
const sources = [];
const assets = {};
for (const [name, version, select] of [
  ['tesseract.js', '7.0.0', path => path.startsWith('dist/') && /(?:tesseract|worker)\.min\.js(?:\.LICENSE\.txt)?$/.test(path) || path === 'LICENSE.md'],
  ['tesseract.js-core', '7.0.0', path => /-lstm\.wasm\.js$/.test(path) || path === 'LICENSE'],
  ...['eng', 'chi_tra', 'chi_sim'].map(lang => [`@tesseract.js-data/${lang}`, '1.0.0', path => path === `4.0.0_best_int/${lang}.traineddata.gz`])
]) {
  const metadata = await (await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
  const response = await fetch(metadata.dist.tarball);
  if (!response.ok) throw new Error(`Download failed: ${name}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  if (integrity !== metadata.dist.integrity) throw new Error(`Integrity failed: ${name}`);
  sources.push({ name, version, url: metadata.dist.tarball, integrity });
  const tar = gunzipSync(archive);
  for (let offset = 0; offset + 512 < tar.length;) {
    const fullName = tar.toString('utf8', offset, offset + 100).replace(/\0.*/, '');
    if (!fullName) break;
    const size = parseInt(tar.toString('ascii', offset + 124, offset + 136), 8) || 0;
    const path = fullName.replace(/^package\//, '');
    if (select(path)) {
      const target = name === 'tesseract.js' ? path.replace('dist/', '')
        : name === 'tesseract.js-core' ? `core/${path}` : `lang/${path.split('/').at(-1)}`;
      const data = tar.subarray(offset + 512, offset + 512 + size);
      mkdirSync(dirname(resolve(root, target)), { recursive: true });
      writeFileSync(resolve(root, target), data);
      assets[target] = createHash('sha256').update(data).digest('hex');
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}
writeFileSync(resolve(root, 'sources.json'), JSON.stringify({ sources, assets }, null, 2) + '\n');
console.log(`Vendored ${Object.keys(assets).length} verified OCR assets`);
