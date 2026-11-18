import { cropPlan, cropMasks, clipCropMask, transformAnnotations } from './crop-geometry.js';

function copyCanvas(source) {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  canvas.getContext('2d').drawImage(source,0,0);return canvas;
}
function replay(source, steps) {
  let canvas=source;
  for(const step of steps){
    const next=document.createElement('canvas');next.width=step.width;next.height=step.height;
    const context=next.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    if(step.shape!=='rect')clipCropMask(context,cropMasks([step])[0]);
    const r=step.rect;context.drawImage(canvas,r.x,r.y,r.width,r.height,0,0,step.width,step.height);
    if(canvas!==source)canvas.width=canvas.height=0;canvas=next;
  }
  return canvas===source?copyCanvas(source):canvas;
}
export function cropDocument({ image, editor, setPreview, changed }) {
  let base=null,state={steps:[],cutout:null},cachedSource=image;
  function capture() {
    const current=editor()?.source;
    if(current&&current!==cachedSource){
      state={...state,cutout:current===image?null:{source:copyCanvas(current),steps:state.steps}};
      cachedSource=current;
    }
    return state;
  }
  function restore(next) {
    const previous=capture();if(!next||next===previous)return;
    base ||= copyCanvas(image);
    // Prepare both sources before replacing the live document. History stores
    // recipes and immutable cutout assets, not one full raster per crop step.
    const clean=replay(base,next.steps);let preview;
    try{preview=next.cutout?replay(next.cutout.source,next.steps.slice(next.cutout.steps.length)):null;}
    catch(error){clean.width=clean.height=0;throw error;}
    image.width=clean.width;image.height=clean.height;image.getContext('2d').drawImage(clean,0,0);clean.width=clean.height=0;
    state=next;const current=editor();current.canvas.width=image.width;current.canvas.height=image.height;
    current.cropMasks=cropMasks(next.steps);setPreview(preview);cachedSource=current.source;
    changed({imageChanged:previous.steps!==next.steps});
  }
  return {capture,restore,apply(input){
    const current=editor();if(!current)throw Error('請先截圖或匯入圖片');
    current.finishText(true);current.cancel();const before=capture();
    if(before.steps.length>=20)throw Error('本張圖片最多連續裁切20次，請匯出後重新匯入');
    const plan=cropPlan(input.rect,image,input.output,input.shape);
    base ||= copyCanvas(image);
    current.record(transformAnnotations(current.items,plan),{...before,steps:[...before.steps,plan]});
  },reset(){if(base)base.width=base.height=0;base=null;state={steps:[],cutout:null};cachedSource=image;}};
}
