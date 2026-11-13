import {dimensionsFromPlan,planGeometryError} from './plan-core.mjs';
import {DEFAULT_HEIGHTS} from './scene-core.mjs';

// Only an explicit square-metre label is evidence of area. Bare dimensions,
// room numbers, several competing labels and low-confidence OCR need clarification.
export function areaFromText(text,confidence=100){
  if(confidence<60)return null;
  // Tesseract reads a small superscript 2 as * or a high quotation mark on
  // some drawings. The browser additionally requires agreement at two scales.
  const values=[...String(text).matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*[mмMМ]\s*(?:[²2*“”?]|\^2)(?!\d)/gu)].map(m=>Number(m[1].replace(',','.'))).filter(n=>n>=2&&n<=225);
  return values.length===1?values[0]:null;
}

// Rectilinear line drawings only. Analyse each wall outward from the interior:
// a solid band is a wall, repeated parallel strokes are glazing, an empty gap
// between solid bands is a doorway. Ambiguous bands are never silently omitted.
export function detectPlanOpenings({data,width,height},rect){
  const lum=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=height)return 255;const i=(y*width+x)*4;return (.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])*data[i+3]/255+255*(1-data[i+3]/255);};
  const band=Math.max(12,Math.round(Math.min(rect.width,rect.height)*.12)),openings=[],uncertain=[];
  for(const wall of ['top','right','bottom','left']){
    const vertical=wall==='left'||wall==='right',length=Math.round(vertical?rect.height:rect.width);
    const pixel=(u,v)=>vertical?lum(rect.x+(wall==='right'?rect.width+v:-v),rect.y+u):lum(rect.x+u,rect.y+(wall==='bottom'?rect.height+v:-v));
    const density=Array.from({length},(_,u)=>{let n=0;for(let v=-2;v<=band;v++)if(pixel(u,v)<145)n++;return n/(band+3);});
    const smooth=density.map((_,u)=>{let n=0,c=0;for(let k=Math.max(0,u-2);k<=Math.min(length-1,u+2);k++){n+=density[k];c++;}return n/c;});
    const baseline=[...smooth].sort((a,b)=>a-b)[Math.floor(length*.8)];
    if(baseline<.17){uncertain.push({wall,reason:'wall_not_found'});continue;}
    const threshold=Math.max(.09,baseline*.35),runs=[];let start=null;
    for(let u=0;u<=length;u++){if(u<length&&smooth[u]<threshold){if(start===null)start=u;}else if(start!==null){if(u-start>=Math.max(12,length*.065))runs.push([start,u]);start=null;}}
    for(const [start,end] of runs){
      if(start<4||end>length-4){uncertain.push({wall,reason:'unbounded_gap',start,end});continue;}
      const inset=Math.max(3,Math.round((end-start)*.12)),rows=[];
      for(let v=0;v<=band;v++){let count=0,total=0;for(let u=start+inset;u<end-inset;u++){if(pixel(u,v)<225)count++;total++;}rows.push(count/Math.max(1,total));}
      let strokes=0,active=false;for(const fraction of rows){if(fraction>.65){if(!active)strokes++;active=true;}else active=false;}
      const kind=strokes>=2?'window':strokes===0?'door':'unknown';
      const candidate={wall,start,end,kind,source:'wall_lines',strokes};
      if(kind==='unknown')uncertain.push(candidate);else openings.push(candidate);
    }
  }
  return {openings,uncertain};
}

export function assembleRecognizedRoom(rect,area,detection){
  const dimensions=dimensionsFromPlan(rect,{mode:'area',area});
  const doors=detection.openings.filter(o=>o.kind==='door'),glazing=detection.openings.filter(o=>o.kind==='window');
  if(detection.uncertain.length||doors.length!==1||!glazing.length)throw Error('Не удалось уверенно определить все окна и дверь. Загрузите более чёткий план или исправьте проёмы вручную.');
  const physical=o=>{const length=['left','right'].includes(o.wall)?rect.height:rect.width,mm=['left','right'].includes(o.wall)?dimensions.depth:dimensions.width;return {wall:o.wall,offset:Math.round(o.start/length*mm),width:Math.round((o.end-o.start)/length*mm)};};
  const door=physical(doors[0]);
  const room={...dimensions,purpose:'bedroom',source:'automatic_plan_analysis',verified:false,reviewedByUser:false,doorWall:door.wall,doorOffset:door.offset,doorWidth:door.width,doorHinge:'start',doorSwing:'inward',windows:glazing.map((o,i)=>({id:'window-'+(i+1),...physical(o),sill:DEFAULT_HEIGHTS.sill,height:DEFAULT_HEIGHTS.window}))};
  const error=planGeometryError(room,DEFAULT_HEIGHTS);if(error)throw Error('Проёмы распознаны неоднозначно. '+error);
  return {room,heights:{...DEFAULT_HEIGHTS},calibration:{mode:'area',area},recognition:{version:1,areaSource:'ocr',dimensionsSource:'area_and_contour_proportions',openingsSource:'wall_lines',assumed:['ceilingHeight','doorHeight','windowHeight','sillHeight','doorHinge','doorSwing'],openingEvidence:detection.openings}};
}
