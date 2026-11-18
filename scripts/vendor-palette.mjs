// Maintenance only. Package the pinned, dependency-free browser distribution.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const version = '3.5.0';
const url = `https://registry.npmjs.org/colorthief/-/colorthief-${version}.tgz`;
const integrity = 'sha512-wV/6Rnkqdx07CAuv8O3WYKBU/j5QdSXbYUfGp26seMIqze5Q40C9ovBSZB9PeVV6XkGe3VWb4zUEtQCYzCfyEA==';
const response = await fetch(url);
if (!response.ok) throw new Error(`Color Thief download failed: ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
if (`sha512-${createHash('sha512').update(archive).digest('base64')}` !== integrity) throw new Error('Color Thief integrity mismatch');
const tar = gunzipSync(archive), files = new Map();
for (let offset = 0; offset + 512 <= tar.length;) {
  const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/, '');
  if (!name) break;
  const size = parseInt(tar.toString('ascii', offset + 124, offset + 136).replace(/\0.*$/, '').trim(), 8) || 0;
  files.set(name.replace(/^package\//, ''), tar.subarray(offset + 512, offset + 512 + size));
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (JSON.parse(files.get('package.json')).version !== version) throw new Error('Unexpected Color Thief version');
const script = files.get('dist/index.browser.js');
const license = files.get('LICENSE');
if (!script || !license?.toString().includes('MIT')) throw new Error('Color Thief assets missing');
const target = resolve('vendor/palette'); mkdirSync(target, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
writeFileSync(resolve(target, 'color-thief.js'), script);
writeFileSync(resolve(target, 'LICENSE'), license);
writeFileSync(resolve(target, 'sources.json'), JSON.stringify({ name: 'colorthief', version, url, integrity,
  assets: { 'color-thief.js': sha(script), LICENSE: sha(license) } }, null, 2) + '\n');
console.log(`Color Thief ${version}: ${script.length} bytes, local browser module`);
