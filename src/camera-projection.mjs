import { ASPECT,FRAME_WIDTH,FRAME_HEIGHT,levelCamera,cameraTarget } from './scene-core.mjs';

// Architectural perspective: level optical axis, world-up vertical, off-axis framing.
// This single path is shared by previews, scoring, all render passes and exports.
export function applyLevelCamera(camera,controls){
  const c=levelCamera(controls);
  camera.position.set(c.x/1000,c.height/1000,c.z/1000);
  camera.near=(c.nearClipMm??50)/1000;
  camera.up.set(0,1,0);camera.fov=c.fov;camera.aspect=ASPECT;
  camera.lookAt(...cameraTarget(c));
  camera.setViewOffset(FRAME_WIDTH,FRAME_HEIGHT,(c.shiftX||0)*FRAME_WIDTH,c.shiftY*FRAME_HEIGHT,FRAME_WIDTH,FRAME_HEIGHT);
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  return c;
}
