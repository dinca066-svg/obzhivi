import {footprint,boundsOf,assessPlacement} from './placement-core.mjs';
export function overlaps(a,b){return a.left<b.right-.01&&a.right>b.left+.01&&a.top<b.bottom-.01&&a.bottom>b.top+.01;}
export function furnitureErrors(room,bed,bedProduct,items,products){
  const boxes=[{id:'bed',bounds:boundsOf(bed,footprint(bedProduct))}],errors=[];
  for(const item of items){
    const product=products.find(p=>p.id===item.productId);
    if(!product||![item.x,item.z].every(Number.isFinite)||![0,90,180,270].includes(item.rotation)){errors.push({id:item.id,message:'Предмет недоступен или его положение некорректно.'});continue;}
    const a=assessPlacement(room,item,footprint(product));
    if(a.outside)errors.push({id:item.id,message:'Тумба пересекает стену.'});
    if(a.doorBlocked)errors.push({id:item.id,message:'Тумба мешает двери или перекрывает подход.'});
    if(boxes.some(b=>overlaps(a.bounds,b.bounds)))errors.push({id:item.id,message:'Предметы мебели пересекаются.'});
    boxes.push({id:item.id,bounds:a.bounds});
  }
  return errors;
}
export function bedsidePair(bed,bedProduct,nightstand){
  const b=footprint(bedProduct),n=footprint(nightstand),a=bed.rotation*Math.PI/180;
  // Align backs with the headboard; face drawers toward the foot of the bed.
  return [-1,1].map((side,i)=>{const u=side*(b.width/2+n.width/2+80),v=-b.depth/2+n.depth/2+30;
    return {id:'nightstand-'+(i+1),productId:nightstand.id,x:Math.round(bed.x+Math.cos(a)*u-Math.sin(a)*v),z:Math.round(bed.z+Math.sin(a)*u+Math.cos(a)*v),rotation:bed.rotation,units:'mm'};});
}
export function furnitureSvg(items,products,errors=[],selected=null){return items.map((item,i)=>{
  const p=products.find(p=>p.id===item.productId);if(!p)return '';const s=footprint(p),bad=errors.some(e=>e.id===item.id),color=bad?'#b34331':'#a6543b';
  return `<g data-item="${i}" tabindex="0" role="button" aria-label="Тумба ${i+1}. Перетаскивайте, стрелки — перемещение, R — поворот" transform="translate(${item.x} ${item.z}) rotate(${item.rotation})"><rect x="${-s.width/2}" y="${-s.depth/2}" width="${s.width}" height="${s.depth}" rx="25" fill="#d7a18b" stroke="${selected===item.id?'#24331d':color}" stroke-width="${selected===item.id?22:12}"/><path d="M-60 ${s.depth/2-35}H60" stroke="#302c28" stroke-width="20"/><text y="30" font-size="85" text-anchor="middle" fill="#493427">Т${i+1}</text></g>`;
}).join('');}
