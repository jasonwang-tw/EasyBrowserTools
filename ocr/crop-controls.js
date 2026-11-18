import { CROP_PRESETS, CROP_RATIOS } from './crop-presets.js';
import { cropPlan } from './crop-geometry.js';

export function cropControls({source,preview,locked,beforeOpen,apply,afterClose}) {
 const $=id=>document.getElementById(id),dialog=$('crop-dialog'),host=$('crop-preview'),launcher=$('open-crop');
 let cropper=null,selection=null,cropImage=null,ready=false,disposed=false,run=0,updateRun=0,frame=null,layoutFrame=null,lastRect=null,previousFocus=null;
 for(const [value,label]of CROP_RATIOS)$('crop-ratio').add(new Option(label,value));
 for(const platform of [...new Set(CROP_PRESETS.map(p=>p.platform))]){const group=document.createElement('optgroup');group.label=platform;for(const preset of CROP_PRESETS.filter(p=>p.platform===platform)){const option=new Option(`${preset.label} · ${preset.width}×${preset.height}${preset.source?'':'（範本）'}`,preset.id);group.append(option);}$('crop-preset').append(group);}
 const preset=()=>CROP_PRESETS.find(p=>p.id===$('crop-preset').value);
 const note=(text,error=false)=>{$('crop-status').textContent=text;$('crop-status').classList.toggle('error',error);};
 function bounds(){const c=cropper.getCropperCanvas().getBoundingClientRect(),b=cropImage.getBoundingClientRect();return{x:b.left-c.left,y:b.top-c.top,width:b.width,height:b.height};}
 function nativeRect(detail=selection){const b=bounds(),s=source();return{x:(detail.x-b.x)*s.width/b.width,y:(detail.y-b.y)*s.height/b.height,width:detail.width*s.width/b.width,height:detail.height*s.height/b.height};}
 function ratio(){if($('crop-shape').value==='circle')return 1;if($('crop-fixed').checked)return Number($('crop-output-width').value)/Number($('crop-output-height').value);const value=$('crop-ratio').value;if(value==='original')return source().width/source().height;if(value==='free')return NaN;const [w,h]=value.split(':').map(Number);return w/h;}
 function summary(){
  if(!ready||!selection)return;
  if($('crop-shape').value==='rounded')selection.borderRadius=`${Math.min(selection.width,selection.height)*.1}px`;
  try{const rect=nativeRect();lastRect=rect;const output=$('crop-fixed').checked?{width:Number($('crop-output-width').value),height:Number($('crop-output-height').value)}:undefined;
   const plan=cropPlan(rect,source(),output,$('crop-shape').value);
   if(!output){$('crop-output-width').value=plan.width;$('crop-output-height').value=plan.height;}
   const scale=Math.max(plan.width/rect.width,plan.height/rect.height);
   note(`裁切區 ${Math.round(rect.width)}×${Math.round(rect.height)} → 輸出 ${plan.width}×${plan.height} px${scale>1.01?`；將放大 ${scale.toFixed(2)} 倍，可能變模糊。一般縮放不會新增細節。`:''}`);
   $('crop-apply').disabled=false;
  }catch(error){note(error.message,true);$('crop-apply').disabled=true;}
  const p=preset(),safe=$('crop-safe-area');safe.hidden=!p?.safe;
  if(p?.safe){Object.assign(safe.style,{left:`${selection.x+selection.width*(1-p.safe.width)/2}px`,top:`${selection.y+selection.height*(1-p.safe.height)/2}px`,width:`${selection.width*p.safe.width}px`,height:`${selection.height*p.safe.height}px`});}
 }
 function update(){
  const p=preset();$('crop-preset-source').textContent=p?`${p.kind} · 核對 ${p.checked}${p.source?'':'；非平台強制尺寸，可自行調整。'}`:'自由裁切保留選區像素；可選比例或指定輸出尺寸。';
  $('crop-source-link').hidden=!p?.source;if(p?.source)$('crop-source-link').href=p.source;
  $('crop-ratio').disabled=$('crop-fixed').checked||$('crop-shape').value==='circle';
  $('crop-output-width').readOnly=$('crop-output-height').readOnly=!$('crop-fixed').checked;
  if(!ready)return;
  const r=ratio();if(Number.isFinite(r)&&r<=0){summary();return;}
  selection.aspectRatio=r;selection.borderRadius=$('crop-shape').value==='circle'?'50%':$('crop-shape').value==='rounded'?'10%':'0';
  const generation=run,revision=++updateRun;
  // Cropper reinitializes its selection on the next tick after a ratio change.
  // Place our constrained selection after that callback, using the rendered image bounds.
  selection.$nextTick(()=>{
   if(!ready||generation!==run||revision!==updateRun)return;
   const b=bounds();let width=b.width*.85,height=b.height*.85;
   if(Number.isFinite(r)){width=Math.min(width,height*r);height=width/r;}
   selection.$change(b.x+(b.width-width)/2,b.y+(b.height-height)/2,width,height,r);summary();
  });
 }
 const presetChange=()=>{const p=preset();if(p){$('crop-fixed').checked=true;$('crop-output-width').value=p.width;$('crop-output-height').value=p.height;}else $('crop-fixed').checked=false;update();};
 const outputChange=()=>{$('crop-preset').value='custom';$('crop-fixed').checked=true;update();};
 const onChange=event=>{
  if(!ready)return;
  const b=bounds(),d=event.detail;
  if(d.width<.5||d.height<.5||d.x<b.x-.01||d.y<b.y-.01||d.x+d.width>b.x+b.width+.01||d.y+d.height>b.y+b.height+.01){event.preventDefault();return;}
  cancelAnimationFrame(frame);frame=requestAnimationFrame(summary);
 };
 function alignRect(rect){const b=bounds(),s=source();selection.$change(b.x+rect.x*b.width/s.width,b.y+rect.y*b.height/s.height,rect.width*b.width/s.width,rect.height*b.height/s.height,ratio());summary();}
 const transformed=()=>{if(!ready||!lastRect)return;const rect={...lastRect},generation=run;cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{if(ready&&generation===run&&dialog.open)alignRect(rect);});};
 async function fitImage(){
  const target=cropImage,instance=cropper;
  const current=()=>target===cropImage&&instance===cropper;
  // With cached sources $ready() can resolve before Cropper's load handler has
  // installed natural dimensions and its initial transform. Let that finish first.
  await new Promise(requestAnimationFrame);if(!current())return;
  await target.$nextTick();if(!current())return;target.scalable=true;target.translatable=true;await target.$nextTick();if(!current())return;
  const box=instance.getCropperCanvas().getBoundingClientRect(),s=source(),scale=Math.min(box.width/s.width,box.height/s.height);
  target.$setTransform(scale,0,0,scale,(box.width-s.width)/2,(box.height-s.height)/2);await target.$nextTick();
  await new Promise(requestAnimationFrame);if(!current())return;target.scalable=false;target.translatable=false;
 }
 async function open(){
  if(locked()||!source()?.width)return;
  beforeOpen();previousFocus=document.activeElement;const generation=++run;ready=false;dialog.showModal();$('crop-close').focus({preventScroll:true});$('crop-apply').disabled=true;note('載入本機裁切工具…');
  try{const {default:Cropper,DEFAULT_TEMPLATE}=await import('../vendor/cropper/cropper.js');if(disposed||generation!==run||!dialog.open)return;
   const canvas=document.createElement('canvas');canvas.width=preview().width;canvas.height=preview().height;canvas.getContext('2d').drawImage(preview(),0,0);
   const template=DEFAULT_TEMPLATE.replace('<cropper-image rotatable scalable skewable translatable>','<cropper-image>').replace('initial-coverage="0.5" movable resizable','movable resizable precise keyboard');
   cropper=new Cropper(canvas,{container:host,template});cropImage=cropper.getCropperImage();selection=cropper.getCropperSelection();selection.tabIndex=0;selection.setAttribute('aria-label','裁切選區，方向鍵移動');selection.addEventListener('change',onChange);cropImage.addEventListener('transform',transformed);
   await cropImage.$ready();if(generation!==run||!dialog.open)return;
   await fitImage();if(generation!==run||!dialog.open)return;host.append($('crop-safe-area'));ready=true;update();canvas.width=canvas.height=0;
  }catch(error){if(generation===run)note(error.message||'裁切工具載入失敗，圖片未變更',true);}
 }
 function cleanup(){run++;ready=false;cancelAnimationFrame(frame);cancelAnimationFrame(layoutFrame);selection?.removeEventListener('change',onChange);cropImage?.removeEventListener('transform',transformed);cropper=null;selection=null;cropImage=null;$('crop-safe-area').hidden=true;const safe=$('crop-safe-area');host.replaceChildren(safe);}
 const closed=()=>{cleanup();if(previousFocus?.isConnected&&!previousFocus.disabled)previousFocus.focus({preventScroll:true});afterClose?.();};
 const commit=async()=>{
  if(!ready||locked())return;
  try{const rect=nativeRect(),output=$('crop-fixed').checked?{width:Number($('crop-output-width').value),height:Number($('crop-output-height').value)}:undefined;
   cropPlan(rect,source(),output,$('crop-shape').value);$('crop-apply').disabled=true;await apply({rect,output,shape:$('crop-shape').value});dialog.close();
  }catch(error){note(error.message||'裁切失敗，圖片未變更',true);$('crop-apply').disabled=false;}
 };
 const flip=()=>{if($('crop-shape').value==='circle')return;if($('crop-fixed').checked){const w=$('crop-output-width').value;$('crop-output-width').value=$('crop-output-height').value;$('crop-output-height').value=w;$('crop-preset').value='custom';}else{const r=ratio();if(!Number.isFinite(r))return;const value=$('crop-ratio').value;const [w,h]=value==='original'?[source().width,source().height]:value.split(':');const inverse=h+':'+w;if(![...$('crop-ratio').options].some(x=>x.value===inverse))$('crop-ratio').add(new Option(`${inverse} 反向`,inverse));$('crop-ratio').value=inverse;}update();};
 const focusKeys=event=>{if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button,input,select,a[href]')].filter(e=>e.tabIndex>=0&&!e.disabled&&e.getClientRects().length);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}};
 const resize=async()=>{if(!ready||!lastRect)return;const rect={...lastRect},generation=run;ready=false;try{await fitImage();if(generation!==run||!dialog.open)return;ready=true;alignRect(rect);}catch{if(generation===run&&dialog.open){ready=true;note('預覽尺寸更新失敗，請重新開啟裁切。',true);$('crop-apply').disabled=true;}}};
 launcher.addEventListener('click',open);dialog.addEventListener('close',closed);dialog.addEventListener('keydown',focusKeys);
 $('crop-preset').addEventListener('change',presetChange);for(const id of ['crop-ratio','crop-shape','crop-fixed'])$(id).addEventListener('change',update);
 for(const id of ['crop-output-width','crop-output-height'])$(id).addEventListener('change',outputChange);
 $('crop-flip').addEventListener('click',flip);$('crop-apply').addEventListener('click',commit);window.addEventListener('resize',resize);
 return{render(){launcher.disabled=locked()||!source()?.width;},get isOpen(){return dialog.open;},reset(){if(dialog.open)dialog.close();else cleanup();},destroy(){disposed=true;if(dialog.open)dialog.close();cleanup();launcher.removeEventListener('click',open);dialog.removeEventListener('close',closed);dialog.removeEventListener('keydown',focusKeys);window.removeEventListener('resize',resize);}};
}
