// Copies daisyUI's official precompiled CSS parts. No runtime CDN or Tailwind JS.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const version = '5.8.1';
const url = `https://registry.npmjs.org/daisyui/-/daisyui-${version}.tgz`;
const integrity = 'sha512-ptP4WHOJ6WltNnA5zwkg3GypOLhsyUM2FHuXCckWVEpWviioInFKsjnShCWYGYHsQ5P9bUCOH1tn45cKLeTUpg==';
const response = await fetch(url);
if (!response.ok) throw new Error(`daisyUI download failed: ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
if (`sha512-${createHash('sha512').update(archive).digest('base64')}` !== integrity) throw new Error('daisyUI integrity mismatch');
const tar = gunzipSync(archive);
const files = new Map();
for (let offset = 0; offset + 512 <= tar.length;) {
  const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/, '');
  if (!name) break;
  const size = parseInt(tar.toString('ascii', offset + 124, offset + 136).replace(/\0.*$/, '').trim(), 8) || 0;
  files.set(name.replace(/^package\//, ''), tar.subarray(offset + 512, offset + 512 + size));
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (JSON.parse(files.get('package.json')).version !== version) throw new Error('Unexpected daisyUI version');
const parts = ['base/properties.css', 'base/reset.css', 'base/rootcolor.css', ...['button', 'select', 'input', 'textarea', 'checkbox', 'badge', 'progress', 'collapse', 'kbd', 'loading', 'card', 'alert', 'modal', 'range', 'dropdown'].map(name => `components/${name}.css`), 'utilities/join.css'];
const css = `/* daisyUI ${version}, MIT. Official precompiled CSS parts; see sources.json and LICENSE. */\n@layer theme, base, components, utilities;\n` + parts.map(path => {
  if (!files.has(path)) throw new Error(`Missing daisyUI part: ${path}`);
  return `/* ${path} */\n${files.get(path).toString('utf8')}`;
}).join('\n');
if (/@import\s|url\(\s*["']?(?:https?:|\/\/)/i.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Unexpected remote CSS resource');
const license = files.get('LICENSE');
if (!license?.toString().includes('MIT')) throw new Error('daisyUI license missing');
const target = resolve('vendor/ui'); mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, 'daisyui.css'), css);
writeFileSync(resolve(target, 'LICENSE'), license);
const sha = value => createHash('sha256').update(value).digest('hex');
writeFileSync(resolve(target, 'sources.json'), JSON.stringify({ name: 'daisyui', version, url, integrity, parts, assets: { 'daisyui.css': sha(css), LICENSE: sha(license) } }, null, 2) + '\n');
console.log(`daisyUI ${version}: ${Buffer.byteLength(css)} bytes of local CSS`);
