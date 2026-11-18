// Maintenance only: npm packages must already exist in the supplied directory.
// Usage: node scripts/vendor-paddle.mjs output/ocr-evaluation/runtime/node_modules
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const modules = resolve(process.argv[2] || 'output/ocr-evaluation/runtime/node_modules');
const target = resolve('vendor/paddle');
mkdirSync(join(target, 'ort'), { recursive: true });
mkdirSync(join(target, 'licenses'), { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const versions = { '@paddleocr/paddleocr-js': '0.4.2', '@techstark/opencv-js': '4.10.0-release.1', 'onnxruntime-web': '1.31.1', 'clipper-lib': '6.4.2', 'js-yaml': '4.3.2', 'esbuild': '0.25.12' };
for (const [name, version] of Object.entries(versions)) {
  if (JSON.parse(readFileSync(join(modules, name, 'package.json'))).version !== version) throw new Error(`Unexpected version: ${name}`);
}
let cv = readFileSync(join(modules, '@techstark/opencv-js/dist/opencv.js'), 'utf8');
const originalCvHash = hash(cv);
if (originalCvHash !== '19b46167b59efbef9cc3836264b0b657110833e4b1df84282004b8b3141c048d') throw new Error('OpenCV source hash mismatch');
function replaceFunction(source, name, next, replacement) {
  const begin = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${next}(`, begin);
  if (begin < 0 || end < begin) throw new Error(`Patch boundary missing: ${name}`);
  return source.slice(0, begin) + replacement + source.slice(end);
}
cv = replaceFunction(cv, 'createNamedFunction', 'extendError', `function createNamedFunction(name,body){var fn=function(){"use strict";return body.apply(this,arguments)};Object.defineProperty(fn,"name",{value:makeLegalFunctionName(name)});return fn}`);
// Replace the nested dynamic-call generator, retaining its fixed argument count.
const dynStart = cv.indexOf('function makeDynCaller(dynCall)');
const dynEnd = cv.indexOf('var fp;', dynStart);
if (dynStart < 0 || dynEnd < dynStart) throw new Error('Missing dynCall patch boundary');
cv = cv.slice(0, dynStart) + `function makeDynCaller(dynCall){var count=signature.length-1;var fn=function(){var args=[rawFunction];for(var i=0;i<count;i++)args.push(arguments[i]);return dynCall.apply(null,args)};Object.defineProperty(fn,"name",{value:"dynCall_"+signature+"_"+rawFunction});Object.defineProperty(fn,"length",{value:count});return fn}` + cv.slice(dynEnd);
cv = replaceFunction(cv, 'craftInvokerFunction', 'heap32VectorToArray', `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){
if(argTypes.length<2)throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
var method=argTypes[1]!==null&&classType!==null;var stack=false;for(var i=1;i<argTypes.length;i++){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined)stack=true}
var fn=function(){if(arguments.length!==argTypes.length-2)throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+(argTypes.length-2));
var destructors=stack?[]:null;var wired=[cppTargetFunc];var converted=[];
if(method){converted[1]=argTypes[1].toWireType(destructors,this);wired.push(converted[1])}
for(var i=2;i<argTypes.length;i++){converted[i]=argTypes[i].toWireType(destructors,arguments[i-2]);wired.push(converted[i])}
var result=cppInvokerFunc.apply(null,wired);
if(stack)runDestructors(destructors);else for(var i=method?1:2;i<argTypes.length;i++){if(argTypes[i].destructorFunction!==null)argTypes[i].destructorFunction(converted[i])}
if(argTypes[0].name!=="void")return argTypes[0].fromWireType(result)};
Object.defineProperty(fn,"name",{value:makeLegalFunctionName(humanName)});Object.defineProperty(fn,"length",{value:argTypes.length-2});return fn}`);
cv = replaceFunction(cv, '__emval_get_method_caller', '__emval_get_property', `function __emval_get_method_caller(argCount,argTypes){var types=__emval_lookupTypes(argCount,argTypes);var retType=types[0];return __emval_addMethodCaller(function(handle,name,destructors,args){var values=[];var offset=0;for(var i=1;i<argCount;i++){values.push(types[i].readValueFromPointer(args+offset));offset+=types[i].argPackAdvance}var rv=handle[name].apply(handle,values);for(var i=1;i<argCount;i++){if(types[i].deleteObject)types[i].deleteObject(values[i-1])}if(!retType.isVoid)return retType.toWireType(destructors,rv)})}`);
if (/new Function\s*\(|new_\(Function|\beval\s*\(/.test(cv)) throw new Error('Dynamic execution remains in OpenCV');
let sdk = readFileSync(join(modules, '@paddleocr/paddleocr-js/dist/index.mjs'), 'utf8');
const originalSdkHash = hash(sdk);
if (originalSdkHash !== '8610d82fdc539e48fa0147763be4b676c699d646a8db75fbceb627d9d37deb94') throw new Error('SDK source hash mismatch');
sdk = sdk.replace('const canvas = document.createElement("canvas");\n  canvas.width = imageBitmap.width;\n  canvas.height = imageBitmap.height;', 'const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);');
sdk = sdk.replace('mat: cv.imread(canvas)', 'mat: cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height))');
// Built-in SDK workers and their CDN fallback are unused. Our dedicated local
// worker has a pinned WASM path; even a future accidental fallback stays local.
sdk = sdk.replaceAll('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/', './ort/');
const { build } = await import(pathToFileURL(join(modules, 'esbuild/lib/main.js')));
await build({ stdin: { contents: sdk, resolveDir: join(modules, '@paddleocr/paddleocr-js/dist'), sourcefile: 'pagekit-paddle.mjs' }, banner: { js: '/* Modified by PageKit 2026-11-17: CSP-safe static OpenCV bindings, OffscreenCanvas, local WASM runtime. See README.md and licenses/. PaddleOCR (c) PaddlePaddle Authors; OpenCV/Techstark; ONNX Runtime (c) Microsoft; Clipper (c) Angus Johnson/Timo/Tom Wu; js-yaml (c) Vitaly Puzrin. */' }, bundle: true, format: 'esm', platform: 'browser', minify: true, outfile: join(target, 'paddle.js'), external: ['fs', 'path'], plugins: [{ name: 'pagekit-csp', setup(b) {
  b.onResolve({ filter: /^@techstark\/opencv-js$/ }, () => ({ path: 'patched-opencv', namespace: 'pagekit' }));
  b.onLoad({ filter: /.*/, namespace: 'pagekit' }, () => ({ contents: cv, loader: 'js' }));
  b.onResolve({ filter: /^onnxruntime-web$/ }, () => ({ path: join(modules, 'onnxruntime-web/dist/ort.wasm.min.mjs') }));
} }] });
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(modules, 'onnxruntime-web/dist', name), join(target, 'ort', name));
for (const name of Object.keys(versions).filter(n => n !== 'esbuild')) {
  const dir = join(modules, name);
  const license = readdirSync(dir).find(n => /^licen[cs]e(?:\.|$)/i.test(n));
  if (license) copyFileSync(join(dir, license), join(target, 'licenses', name.replaceAll('/', '-').replace('@', '') + '.txt'));
}
// Paddle's npm tarball omits LICENSE; the SDK is Apache-2.0 per package.json.
copyFileSync(join(modules, '@techstark/opencv-js/LICENSE'), join(target, 'licenses/Apache-2.0.txt'));
const assets = {};
function inventory(dir, prefix = '') { for (const e of readdirSync(dir, { withFileTypes: true })) { const path = prefix + e.name; if (e.isDirectory()) inventory(join(dir, e.name), path + '/'); else if (path !== 'sources.json' && path !== 'README.md') assets[path] = hash(readFileSync(join(dir, e.name))); } }
inventory(target);
writeFileSync(join(target, 'sources.json'), JSON.stringify({ versions, upstream: 'https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js', originalCvHash, originalSdkHash, patchedCvHash: hash(cv), patches: ['OpenCV static Embind wrappers (four generators)', 'SDK OffscreenCanvas and matFromImageData for dedicated worker', 'No CDN runtime fallback; WASM-only ONNX Runtime'], assets }, null, 2) + '\n');
console.log('Vendored Paddle runtime:', Object.keys(assets).length, 'assets');
