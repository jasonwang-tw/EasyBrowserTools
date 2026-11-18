import test from 'node:test';
import assert from 'node:assert/strict';
import { cutoutInput, cutoutMask, validateImportedImage, validateImageSize, IMPORT_MAX_BYTES } from '../ocr/cutout-pixels.js';
import { verifyCutout, CUTOUT_FILE } from '../ocr/cutout-model-store.js';
import { downloadCutout } from '../ocr/cutout-model-download.js';
import { installModelService } from '../ocr/model-download.js';

test('去背前處理為 RGB CHW ImageNet；透明像素僅在模型輸入合成白色', () => {
  const red = cutoutInput(Uint8ClampedArray.from([255,0,0,255]), 1);
  assert.ok(Math.abs(red[0] - (1-.485)/.229) < 1e-6);
  assert.ok(Math.abs(red[1] - (0-.456)/.224) < 1e-6);
  assert.deepEqual(cutoutInput(Uint8ClampedArray.from([0,0,0,0]),1),cutoutInput(Uint8ClampedArray.from([255,255,255,255]),1));
  assert.throws(()=>cutoutInput(new Uint8Array(3),1), /尺寸/);
});
test('去背 logits 用 sigmoid 保留半透明邊緣；拒絕異常輸出', () => {
  assert.equal(cutoutMask(Float32Array.from([0]),1)[3],128);
  assert.equal(cutoutMask(Float32Array.from([-100]),1)[3],0);
  assert.equal(cutoutMask(Float32Array.from([100]),1)[3],255);
  assert.throws(()=>cutoutMask(Float32Array.from([NaN]),1),/無效/);
  assert.throws(()=>cutoutMask(new Float32Array(0),1),/尺寸/);
});
test('本機圖片匯入拒絕 SVG／非圖片、過大檔案與異常尺寸', () => {
  for(const type of ['image/png','image/jpeg','image/webp']) validateImportedImage({type,size:200});
  for(const file of [{type:'image/svg+xml',size:200},{type:'text/plain',size:100},{type:'image/png',size:IMPORT_MAX_BYTES+1},{type:'image/png',size:0}]) assert.throws(()=>validateImportedImage(file));
  validateImageSize(4000,4000);
  for(const [w,h] of [[0,2],[4.5,2],[16385,1],[5000,4000],[Infinity,20]]) assert.throws(()=>validateImageSize(w,h));
});
test('去背模型大小／雜湊損壞時不進入保存步驟', async () => {
  await assert.rejects(verifyCutout(new ArrayBuffer(1)), /大小/);
  await assert.rejects(verifyCutout(new ArrayBuffer(CUTOUT_FILE.bytes)), /完整性/);
  for(const mode of ['short','over','http','cancel']) {
    const c=new AbortController();
    await assert.rejects(downloadCutout({signal:c.signal,fetcher:async(url,options)=>{
      assert.equal(url,CUTOUT_FILE.url);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'follow');
      if(mode==='cancel') c.abort();
      return mode==='http'?new Response('error',{status:503}):new Response(new Uint8Array(mode==='over'?CUTOUT_FILE.bytes+1:20));
    },save:()=>assert.fail('失敗下載不可保存')}));
  }
});
test('去背下載進度、單檔保存及取消信號傳遞', async()=>{
  let saved=0,last;
  const c=new AbortController();
  await downloadCutout({signal:c.signal,fetcher:async()=>new Response(new Uint8Array(CUTOUT_FILE.bytes)),progress:p=>{last=p;},save:async(buffer,signal)=>{assert.equal(signal,c.signal);assert.equal(buffer.byteLength,CUTOUT_FILE.bytes);saved++;}});
  assert.equal(saved,1);assert.deepEqual(last,{received:CUTOUT_FILE.bytes,total:CUTOUT_FILE.bytes});
});
test('去背服務獨立路由、權限與刪除，不改動 OCR 模型偏好',async()=>{
  let message,connect,installed=0,removed=0;
  const api={runtime:{id:'pk',getURL:p=>'chrome-extension://pk/'+p,onMessage:{addListener:f=>message=f},onConnect:{addListener:f=>connect=f}},permissions:{contains:async p=>{assert.deepEqual(p.origins,['https://example-model.test/*']);return true;}}};
  installModelService(api,{statusType:'CUTOUT_MODEL_STATUS',deleteType:'CUTOUT_MODEL_DELETE',portName:'pagekit-cutout-download',permissions:['https://example-model.test/*'],ready:async()=>true,download:async()=>{},remove:async()=>removed++,onInstalled:async()=>installed++,onRemoved:async()=>{}});
  const sender={id:'pk',url:api.runtime.getURL('ocr/ocr.html')};
  assert.equal(message({type:'MODEL_DELETE'},sender,()=>assert.fail()),false);
  assert.equal(message({type:'CUTOUT_MODEL_DELETE'},{id:'other',url:sender.url},()=>assert.fail()),false);
  const deleted=await new Promise(resolve=>message({type:'CUTOUT_MODEL_DELETE'},sender,resolve));assert.equal(deleted.success,true);assert.equal(removed,1);
  let receive;const events=[];
  connect({name:'pagekit-cutout-download',sender,postMessage:m=>events.push(m),onDisconnect:{addListener(){}},onMessage:{addListener:f=>receive=f}});
  receive({type:'START'});await new Promise(r=>setImmediate(r));
  assert.equal(events.at(-1).type,'DONE');assert.equal(installed,1);
});
