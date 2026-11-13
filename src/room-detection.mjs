// Conservative image-only proposals, not architectural recognition or verified geometry.
// Keep long horizontal/vertical strokes, bridge doorway-sized gaps, then find
// enclosed, nearly rectangular free regions. Rotated/irregular/noisy plans fall back to manual selection.
export function detectRoomRegions({data,width,height}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<40||height<40||width*height>1600000||data.length!==width*height*4)return [];
 const n=width*height,ink=new Uint8Array(n),walls=new Uint8Array(n),short=Math.min(width,height),minRun=Math.max(12,Math.round(short*.045)),maxGap=Math.round(short*.12);
 for(let i=0;i<n;i++){const p=i*4;ink[i]=data[p+3]>180&&(.2126*data[p]+.7152*data[p+1]+.0722*data[p+2])<195?1:0;}
 function strokes(vertical){const rows=vertical?width:height,cols=vertical?height:width,index=(r,c)=>vertical?c*width+r:r*width+c;
  for(let r=0;r<rows;r++){
   const runs=[];let start=-1,last=-1;
   for(let c=0;c<=cols+2;c++){
    if(c<cols&&ink[index(r,c)]){if(start<0)start=c;last=c;}
    else if(start>=0&&c-last>2){if(last-start+1>=minRun)runs.push([start,last]);start=-1;}
   }
   for(let i=0;i<runs.length;i++){const [a,b]=runs[i];for(let c=a;c<=b;c++)walls[index(r,c)]=1;
    if(i&&a-runs[i-1][1]-1<=maxGap)for(let c=runs[i-1][1];c<a;c++)walls[index(r,c)]=1;
   }
  }
 }
 strokes(false);strokes(true);
 const visited=new Uint8Array(n),queue=new Int32Array(n),regions=[];
 for(let seed=0;seed<n;seed++){
  if(walls[seed]||visited[seed])continue;
  let head=0,tail=1,count=0,minX=width,maxX=0,minY=height,maxY=0,touchesEdge=false;queue[0]=seed;visited[seed]=1;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x===0||y===0||x===width-1||y===height-1)touchesEdge=true;
   for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(q>=0&&!walls[q]&&!visited[q]){visited[q]=1;queue[tail++]=q;}
  }
  const w=maxX-minX+1,h=maxY-minY+1,fill=count/(w*h);
  if(touchesEdge||w<short*.12||h<short*.12||count<n*.012||count>n*.7||fill<.93||w/h>3.8||h/w>3.8)continue;
  regions.push({x:minX,y:minY,width:w,height:h,rectangularity:fill,source:'line_detection',verified:false});
 }
 return regions.sort((a,b)=>a.y-b.y||a.x-b.x).slice(0,12);
}
export function rescaleRegions(regions,from,to){return regions.map((r,i)=>({...r,id:'region-'+i,x:r.x*to.width/from.width,y:r.y*to.height/from.height,width:r.width*to.width/from.width,height:r.height*to.height/from.height}));}
