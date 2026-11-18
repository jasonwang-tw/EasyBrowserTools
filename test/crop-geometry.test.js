import test from 'node:test';
import assert from 'node:assert/strict';
import { cropPlan, cropMasks, transformAnnotations } from '../ocr/crop-geometry.js';
import { CROP_PRESETS } from '../ocr/crop-presets.js';
const source={width:800,height:600};
test('自由裁切保留選區像素，社群裁切使用指定尺寸且不改比例',()=>{
 const rect={x:100,y:100,width:300,height:100};
 assert.deepEqual(cropPlan(rect,source).width,300);
 assert.deepEqual(cropPlan(rect,source,{width:1500,height:500}).height,500);
 assert.throws(()=>cropPlan(rect,source,{width:500,height:500}),/比例/);
});
test('拒絕越界、零尺寸、無效數值、過大輸出與未知形狀',()=>{
 const rect={x:0,y:0,width:400,height:400};
 for(const bad of [{...rect,x:-2},{...rect,width:0},{...rect,x:NaN},{...rect,width:900}])assert.throws(()=>cropPlan(bad,source));
 for(const output of [{width:0,height:0},{width:5000,height:5000},{width:Infinity,height:200},{width:20000,height:20000}])assert.throws(()=>cropPlan(rect,source,output));
 assert.throws(()=>cropPlan(rect,source,undefined,'heart'));
});
test('正圓必須正方形裁切及輸出，不以拉伸模擬正圓',()=>{
 assert.equal(cropPlan({x:10,y:10,width:300,height:300},source,{width:400,height:400},'circle').shape,'circle');
 assert.throws(()=>cropPlan({x:0,y:0,width:300,height:100},source,undefined,'circle'),/正圓/);
});
test('文字、編號與線段的座標與寬度等比例轉換，保留可編輯物件',()=>{
 const items=[{tool:'text',text:'hello',start:{x:150,y:120},fontSize:20},{tool:'number',number:2,start:{x:200,y:140},radius:16,fontSize:18},{tool:'line',start:{x:100,y:100},end:{x:300,y:200},width:3,points:[{x:100,y:100}],headSize:14}];
 const before=structuredClone(items),plan=cropPlan({x:100,y:100,width:400,height:200},source,{width:800,height:400});
 const result=transformAnnotations(items,plan);
 assert.deepEqual(result[0].start,{x:100,y:40});assert.equal(result[0].fontSize,40);assert.equal(result[0].text,'hello');
 assert.equal(result[1].radius,32);assert.equal(result[1].number,2);assert.equal(result[2].width,6);assert.deepEqual(result[2].end,{x:400,y:200});assert.deepEqual(items,before);
});
test('多次裁切轉換既有圓形遮罩，新增標註也可遵守先前遮罩',()=>{
 const first=cropPlan({x:0,y:0,width:400,height:400},source,{width:400,height:400},'circle');
 const second=cropPlan({x:100,y:100,width:200,height:200},{width:400,height:400},{width:100,height:100},'rounded');
 const masks=cropMasks([first,second]);assert.equal(masks.length,2);assert.deepEqual(masks[0].rect,{x:-50,y:-50,width:200,height:200});assert.deepEqual(masks[1].rect,{x:0,y:0,width:100,height:100});assert.equal(masks[1].radius,10);
});
test('社群尺寸包含確認的七平台，官方項目有來源，範本不冒充規範',()=>{
 assert.deepEqual([...new Set(CROP_PRESETS.map(x=>x.platform))],['Facebook','Instagram','Threads','YouTube','X','LinkedIn','LINE']);
 assert.equal(new Set(CROP_PRESETS.map(x=>x.id)).size,CROP_PRESETS.length);
 for(const p of CROP_PRESETS){assert.ok(p.width>0&&p.height>0&&p.width*p.height<=16_000_000);assert.equal(p.checked,'2026-11-18');assert.equal(p.kind==='官方規格／建議',Boolean(p.source));}
 assert.equal(CROP_PRESETS.find(x=>x.id==='li-company').width,1512);
 assert.deepEqual([CROP_PRESETS.find(x=>x.id==='x-banner').width,CROP_PRESETS.find(x=>x.id==='x-banner').height],[1500,500]);
});
