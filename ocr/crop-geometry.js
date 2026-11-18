export const CROP_SHAPES = ['rect', 'rounded', 'circle'];
export function cropPlan(rect, source, output, shape = 'rect') {
  if (!CROP_SHAPES.includes(shape) || ![rect.x,rect.y,rect.width,rect.height,source.width,source.height].every(Number.isFinite)
    || rect.width < 1 || rect.height < 1 || rect.x < -.01 || rect.y < -.01 || rect.x+rect.width > source.width+.01 || rect.y+rect.height > source.height+.01) throw Error('裁切範圍必須在圖片內，且至少 1×1 像素');
  const width = Math.round(output?.width ?? rect.width), height = Math.round(output?.height ?? rect.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width>16384 || height>16384 || width*height>16_000_000) throw Error('輸出上限為 1,600 萬像素、單邊 16,384px');
  if (shape==='circle' && (width!==height || Math.abs(rect.width-rect.height)>.01)) throw Error('正圓需 1:1 裁切與正方形輸出，請選擇大頭貼或正方形尺寸');
  if (Math.abs(width/height - rect.width/rect.height) / (width/height) > .01 && output) throw Error('裁切比例與輸出尺寸不符，請調整裁切框');
  return {rect:{...rect,x:Math.max(0,rect.x),y:Math.max(0,rect.y)},width,height,shape};
}
export function transformAnnotations(items, plan) {
  const sx=plan.width/plan.rect.width,sy=plan.height/plan.rect.height,scale=Math.sqrt(sx*sy);
  const point=p=>({x:(p.x-plan.rect.x)*sx,y:(p.y-plan.rect.y)*sy});
  return items.map(item=>{
    const next={...item,start:point(item.start)};
    if(item.end)next.end=point(item.end); if(item.points)next.points=item.points.map(point);
    for(const key of ['width','fontSize','radius','headSize'])if(Number.isFinite(item[key]))next[key]=item[key]*scale;
    return next;
  });
}
export function cropMasks(steps) {
  let masks=[];
  for(const plan of steps){
    const sx=plan.width/plan.rect.width,sy=plan.height/plan.rect.height;
    masks=masks.map(mask=>({...mask,rect:{x:(mask.rect.x-plan.rect.x)*sx,y:(mask.rect.y-plan.rect.y)*sy,width:mask.rect.width*sx,height:mask.rect.height*sy},radius:mask.radius*Math.min(sx,sy)}));
    if(plan.shape!=='rect')masks.push({shape:plan.shape,rect:{x:0,y:0,width:plan.width,height:plan.height},radius:Math.min(plan.width,plan.height)*.1});
  }
  return masks;
}
export function clipCropMask(context, mask) {
  const {x,y,width,height}=mask.rect;context.beginPath();
  if(mask.shape==='circle')context.ellipse(x+width/2,y+height/2,width/2,height/2,0,0,Math.PI*2);
  else context.roundRect(x,y,width,height,mask.radius);
  context.clip();
}
