import {createWorker} from 'tesseract.js';
import {areaFromText} from './plan-recognition.mjs';

export async function recognizeArea(source,rect,signal,onProgress=()=>{}){
  if(rect.width<20||rect.height<20||rect.width/rect.height<.1||rect.width/rect.height>10)throw Error('Выделенная область слишком узкая для спальни. Исправьте её границы на плане.');
  let worker,timer,closed=false,rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const abort=()=>{closed=true;worker?.terminate();rejectAbort(new DOMException('Распознавание отменено.','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  try{
    const operation=(async()=>{
      worker=await createWorker('rus',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(!signal.aborted&&m.status==='recognizing text')onProgress();}});
      if(closed){await worker.terminate();throw Error('Распознавание отменено.');}signal.throwIfAborted();
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      const evidence=[];
      for(const width of [550,750,1000]){
        signal.throwIfAborted();
        const inset=Math.max(4,Math.min(rect.width,rect.height)*.025),w=rect.width-2*inset,h=rect.height-2*inset;
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.min(3000,Math.round(width*h/w));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,rect.x+inset,rect.y+inset,w,h,0,0,canvas.width,canvas.height);
        const {data}=await worker.recognize(canvas);signal.throwIfAborted();
        evidence.push({text:data.text,confidence:data.confidence,area:areaFromText(data.text,data.confidence)});
      }
      const values=evidence.map(e=>e.area).filter(Boolean);
      return {area:values.length>=2&&new Set(values).size===1?values[0]:null,evidence};
    })();
    return await Promise.race([operation,aborted,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Чтение плана заняло слишком много времени. Попробуйте ещё раз.')),60000);})]);
  }finally{closed=true;clearTimeout(timer);signal.removeEventListener('abort',abort);await worker?.terminate();}
}
