import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { splitTranslationText, translateOcrText, validateOcrTranslation, TRANSLATION_LANGUAGES } from '../translation-service.js';
import { installOcrTranslation } from '../ocr/translation-port.js';
afterEach(() => mock.restoreAll());

test('OCR 多語目標、空白、過長與無效 Unicode 在請求前檢查', async () => {
  const fetcher=mock.method(globalThis,'fetch',()=>assert.fail('不可送出無效文字'));
  for(const [text,target] of [['','en'],['   ','zh-TW'],['x'.repeat(30001),'en'],['hello','javascript:evil'],['\ud800','en'],[{},'en']]) await assert.rejects(translateOcrText(text,target));
  assert.equal(fetcher.mock.callCount(),0);
  for(const [code] of TRANSLATION_LANGUAGES) validateOcrTranslation('有效 OCR text',code);
  assert.throws(()=>splitTranslationText('text',0));
});
test('長 OCR 分段不漏字、不拆 surrogate pair，且限制編碼 URL 長度', () => {
  for(const text of ['a'.repeat(15000),('繁體 中文 😀.\r\nEnglish words!\n').repeat(600),'\n  '+('漢字\t😀word ').repeat(1000)+'  \r\n']){
    const chunks=splitTranslationText(text);
    assert.equal(chunks.join(''),text);
    assert.ok(chunks.every(c=>encodeURIComponent(c).length<=4000));
    assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c)));
  }
});
test('OCR 明確選擇目標語言、來源自動偵測，不沿用中英方向；保留空白換行',async()=>{
  const input='  中文 English\n'+('繁體文字 mixed 😀 words\r\n').repeat(300)+'\n';const progress=[];
  mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url.origin,'https://translate.google.com');assert.equal(url.searchParams.get('sl'),'auto');assert.equal(url.searchParams.get('tl'),'ja');assert.equal(options.credentials,'omit');
    assert.ok(url.href.length<5000);return Response.json([[[url.searchParams.get('q')]]]);
  });
  const result=await translateOcrText(input,'ja',{progress:p=>progress.push(p)});
  assert.equal(result.original,input);assert.equal(result.translated,input);assert.equal(result.to,'ja');assert.ok(progress.length>1);assert.equal(progress.at(-1).completed,progress.length);
});
test('分段中途取消／服務失敗不回傳部分成功結果，也不繼續下一段',async()=>{
  const c=new AbortController();let requests=0;
  mock.method(globalThis,'fetch',async()=>{requests++;return Response.json([[['translated']]]);});
  await assert.rejects(translateOcrText('a'.repeat(9000),'en',{signal:c.signal,progress:()=>c.abort()}));assert.equal(requests,1);
  mock.restoreAll();requests=0;
  mock.method(globalThis,'fetch',async()=>++requests===1?Response.json([[['first']]]):new Response('',{status:503}));
  await assert.rejects(translateOcrText('b'.repeat(9000),'en'),/503/);assert.equal(requests,2);
});
test('OCR 翻譯 Port 拒絕外部網頁、其他擴充與錯誤路由',()=>{
  let connect;const api={runtime:{id:'pk',getURL:p=>'chrome-extension://pk/'+p,onConnect:{addListener:f=>connect=f}}};
  installOcrTranslation(api);
  for(const sender of [{id:'other',url:api.runtime.getURL('ocr/ocr.html')},{id:'pk',url:'https://example.com'},{id:'pk',url:api.runtime.getURL('ocr/ocr.html.fake')}]) connect({name:'pagekit-ocr-translation',sender,onDisconnect:{addListener:()=>assert.fail()}});
});
test('Port 只啟動一次、傳入完整原文與目標；斷線中止背景工作',async()=>{
  let connect,receive,disconnect,signal,resolve;const messages=[];let calls=0;
  const api={runtime:{id:'pk',getURL:p=>'chrome-extension://pk/'+p,onConnect:{addListener:f=>connect=f}}};
  installOcrTranslation(api,{translate:(text,target,options)=>{calls++;assert.equal(text,'edited OCR text');assert.equal(target,'fr');signal=options.signal;options.progress({completed:1,total:2});return new Promise(r=>resolve=r);}});
  connect({name:'pagekit-ocr-translation',sender:{id:'pk',url:api.runtime.getURL('ocr/ocr.html')},postMessage:m=>messages.push(m),onDisconnect:{addListener:f=>disconnect=f},onMessage:{addListener:f=>receive=f}});
  receive({type:'PING'});assert.equal(calls,0);
  receive({type:'START',text:'edited OCR text',target:'fr'});receive({type:'START'});assert.equal(calls,1);assert.equal(messages[0].type,'PROGRESS');
  disconnect();assert.equal(signal.aborted,true);resolve({translated:'late'});await new Promise(r=>setImmediate(r));assert.ok(!messages.some(m=>m.type==='DONE'));
});
test('Port 成功及錯誤使用明確終態，不接觸剪貼簿',async()=>{
  for(const fail of [false,true]) {
    let connect,receive;const messages=[];const api={runtime:{id:'pk',getURL:p=>'chrome-extension://pk/'+p,onConnect:{addListener:f=>connect=f}}};
    installOcrTranslation(api,{translate:async()=>{if(fail)throw Error('服務失敗');return{translated:'你好',to:'zh-TW'};}});
    connect({name:'pagekit-ocr-translation',sender:{id:'pk',url:api.runtime.getURL('ocr/ocr.html')},postMessage:m=>messages.push(m),onDisconnect:{addListener(){}},onMessage:{addListener:f=>receive=f}});
    receive({type:'START',text:'hello',target:'zh-TW'});await new Promise(r=>setImmediate(r));assert.equal(messages.at(-1).type,fail?'ERROR':'DONE');
  }
});
