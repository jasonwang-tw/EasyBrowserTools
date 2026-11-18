import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const version = '2.3.1', url = `https://registry.npmjs.org/cropperjs/-/cropperjs-${version}.tgz`;
const integrity = 'sha512-bgy+iHRFjsBxBCriXkTuFuHRJGSGZISuqDGhDQG7gLK0F7qOzhH06bdXzGf4b0bZSQ+mApakybiW9xvKnS9dbg==';
const response = await fetch(url); if (!response.ok) throw Error(`Cropper download: ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
if (`sha512-${createHash('sha512').update(archive).digest('base64')}` !== integrity) throw Error('Cropper integrity mismatch');
const tar = gunzipSync(archive), files = new Map();
for (let offset=0; offset+512<=tar.length;) {
  const name=tar.toString('utf8',offset,offset+100).replace(/\0.*$/,''); if(!name)break;
  const size=parseInt(tar.toString('ascii',offset+124,offset+136).replace(/\0.*$/,'').trim(),8)||0;
  files.set(name.replace(/^package\//,''),tar.subarray(offset+512,offset+512+size)); offset+=512+Math.ceil(size/512)*512;
}
if(JSON.parse(files.get('package.json')).version!==version)throw Error('Cropper version mismatch');
const script=files.get('dist/cropper.esm.min.js'),license=files.get('LICENSE');
if(!script||!license?.toString().includes('MIT'))throw Error('Cropper assets missing');
const target=resolve('vendor/cropper');mkdirSync(target,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
writeFileSync(resolve(target,'cropper.js'),script);writeFileSync(resolve(target,'LICENSE'),license);
writeFileSync(resolve(target,'sources.json'),JSON.stringify({name:'cropperjs',version,url,integrity,assets:{'cropper.js':sha(script),LICENSE:sha(license)}},null,2)+'\n');
console.log(`Cropper.js ${version}: ${script.length} bytes, local ESM`);
