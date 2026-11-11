// Read a white object silhouette from a bottom-up RGBA render target.
// Pixel-area centroid approximates visual mass rather than the empty bounding box.
export function silhouetteCenter(pixels,width,height){
  let count=0,xSum=0,ySum=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4]>127){count++;xSum+=x+.5;ySum+=height-y-.5;}
  return count?{x:xSum/count/width,y:ySum/count/height,area:count/(width*height)}:null;
}
export function centeredShift(camera,center){return {...camera,shiftX:Math.max(-.35,Math.min(.35,(camera.shiftX||0)+center.x-.5)),shiftY:Math.max(-.35,Math.min(.35,(camera.shiftY||0)+center.y-.5))};}
export function isCentered(center){return !!center&&Math.abs(center.x-.5)<=.015&&Math.abs(center.y-.5)<=.015;}
