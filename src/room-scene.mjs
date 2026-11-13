import {projectedGroup,cornerInFrame,polygonArea,architectureError} from './architecture-frame.mjs';
import {productBuffer} from './bundled-products.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { openingsFor, wallCells, cameraTarget, ASPECT, FRAME_WIDTH } from './scene-core.mjs';
import { frameMetrics } from './frame-metrics.mjs';
import { silhouetteCenter,centeredShift,isCentered } from './visual-balance.mjs';
import { applyLevelCamera } from './camera-projection.mjs';
import { doorGeometry } from './placement-core.mjs';

export const MASKS={floor:'#aa7744',ceiling:'#bbaadd',wallTop:'#e65c5c',wallRight:'#66aa66',wallBottom:'#6688cc',wallLeft:'#ddbb55',windows:'#44cccc',door:'#cc66aa',bed:'#8844dd'};
export class RoomScene{
  constructor(host){
    this.host=host;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#d9e3e7');
    // No MSAA: object-ID pass keeps exact palette values at silhouettes.
    this.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    host.append(this.renderer.domElement);this.camera=new THREE.PerspectiveCamera(60,ASPECT,.05,30);
    this.scene.add(new THREE.HemisphereLight(0xfffbf1,0x9b907e,1.4));
    const light=new THREE.DirectionalLight(0xfff3dc,1.7);light.position.set(4,7,6);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:35});light.shadow.normalBias=.025;light.shadow.bias=-.0001;this.scene.add(light);this.keyLight=light;this.scene.add(light.target);
    const fill=new THREE.PointLight(0xffffff,12,20);fill.position.set(1.5,2.4,3);this.scene.add(fill);
    const pmrem=new THREE.PMREMGenerator(this.renderer),env=new RoomEnvironment();this.environment=pmrem.fromScene(env,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.35;env.dispose();pmrem.dispose();
    this.architecture=new THREE.Group();this.scene.add(this.architecture);this.bed=null;this.furniture=[];this.extraBuffers=new Map();
    this.maskMaterials=Object.fromEntries(Object.entries(MASKS).map(([id,color])=>[id,new THREE.MeshBasicMaterial({color,toneMapped:false,side:THREE.DoubleSide})]));
    this.balanceTarget=new THREE.WebGLRenderTarget(192,256);
    this.balancePixels=new Uint8Array(192*256*4);
    this.balanceWhite=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false});
    this.balanceBlack=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide,toneMapped:false});
    this.passMaterialVariants=new WeakMap();
    this.depth=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,side:THREE.DoubleSide});
    this.depthUniforms={captureNear:{value:this.camera.near},captureFar:{value:this.camera.far}};
    this.depth.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.depthUniforms);shader.fragmentShader='uniform float captureNear;\nuniform float captureFar;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );','float viewDepth = (captureNear * captureFar) / (captureFar - fragCoordZ * (captureFar - captureNear));\n gl_FragColor = vec4(vec3(1.0 - clamp((viewDepth-captureNear)/(captureFar-captureNear),0.0,1.0)),1.0);');};
  }
  box(parent,size,position,color,mask){const material=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0});const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.userData.mask=mask;mesh.receiveShadow=mask==='floor';parent.add(mesh);return mesh;}
  buildRoom(room,h){
    this.room=room;this.heights=h;
    this.architecture.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});this.architecture.clear();
    const w=room.width/1000,d=room.depth/1000,H=h.ceiling/1000;
    this.keyLight.target.position.set(w/2,0,d/2);this.camera.far=Math.ceil(Math.hypot(w,d,H)+6);this.depthUniforms.captureFar.value=this.camera.far;
    this.box(this.architecture,[w+.24,.08,d+.24],[w/2,-.04,d/2],'#c7b9a0','floor');
    this.box(this.architecture,[w+.24,.08,d+.24],[w/2,H+.04,d/2],'#faf7f0','ceiling');
    const openings=openingsFor(room,h),maskNames={top:'wallTop',right:'wallRight',bottom:'wallBottom',left:'wallLeft'};
    for(const wall of ['top','right','bottom','left']){
      const horizontal=wall==='top'||wall==='bottom',length=horizontal?room.width:room.depth;
      const toWorld=(u,v)=>horizontal?[u,v,wall==='top'?-.06:d+.06]:[wall==='left'?-.06:w+.06,v,u];
      for(const cell of wallCells(length,h.ceiling,openings.filter(o=>o.wall===wall))){const cw=(cell.end-cell.start)/1000,ch=(cell.top-cell.bottom)/1000;this.box(this.architecture,horizontal?[cw,ch,.12]:[.12,ch,cw],toWorld((cell.start+cell.end)/2000,(cell.bottom+cell.top)/2000),'#eee9df',maskNames[wall]);}
      for(const o of openings.filter(o=>o.wall===wall&&o.kind==='window')){
        const width=(o.end-o.start)/1000,height=(o.top-o.bottom)/1000,u=(o.start+o.end)/2000,v=(o.bottom+o.top)/2000;
        const pane=this.box(this.architecture,horizontal?[width,height,.035]:[.035,height,width],toWorld(u,v),'#d3e3e8','windows');pane.material.emissive.set('#9dafb8');pane.material.emissiveIntensity=.25;
        for(const edge of [o.start/1000,o.end/1000,u])this.box(this.architecture,horizontal?[.045,height,.1]:[.1,height,.045],toWorld(edge,v),'#faf9f3','windows');
        for(const edge of [o.bottom/1000,o.top/1000])this.box(this.architecture,horizontal?[width,.045,.12]:[.12,.045,width],toWorld(u,edge),'#faf9f3','windows');
      }
    }
    const dg=doorGeometry(room),dx=dg.closed.x-dg.hinge.x,dz=dg.closed.z-dg.hinge.z;
    const leaf=this.box(this.architecture,[.04,h.door/1000,room.doorWidth/1000],[(dg.closed.x+dg.hinge.x)/2000,h.door/2000,(dg.closed.z+dg.hinge.z)/2000],'#d6c7ae','door');leaf.rotation.y=Math.atan2(dx,dz);leaf.userData.doorState='closed';
    const horizontal=['top','bottom'].includes(room.doorWall),o=room.doorOffset/1000,D=room.doorWidth/1000,Hd=h.door/1000;
    const part=(u,y,v,width,height,depth,color,role)=>{const p=dg.map(u*1000,v*1000);const m=this.box(this.architecture,horizontal?[width,height,depth]:[depth,height,width],[p.x/1000,y,p.z/1000],color,'door');m.userData.doorPart=role;return m;};
    leaf.material.color.set('#b89c7b');
    // All details are on the room side of the closed leaf, regardless of hinge/swing.
    for(const u of [o-.025,o+D+.025])part(u,Hd/2+.035,.035,.07,Hd+.07,.055,'#e4dbcc','jamb');
    part(o+D/2,Hd+.035,.035,D+.12,.07,.055,'#e4dbcc','lintel');
    for(const y of [Hd*.32,Hd*.73])part(o+D/2,y,.023,D*.73,Hd*.27,.014,'#a98e70','panel');
    const handleU=room.doorHinge==='end'?o+.12:o+D-.12;
    part(handleU,1.02,.055,.045,.12,.065,'#34342f','handle-base');
    part(handleU+(room.doorHinge==='end'?.045:-.045),1.04,.1,.13,.025,.025,'#34342f','handle');
    this.scene.updateMatrixWorld(true);this.doorBounds=new THREE.Box3();this.architecture.children.filter(m=>m.userData.mask==='door').forEach(m=>this.doorBounds.union(new THREE.Box3().setFromObject(m,true)));
    this.doorCorners=[[o,0],[o+D,0],[o+D,Hd],[o,Hd]].map(([u,y])=>{const p=dg.map(u*1000,25);return new THREE.Vector3(p.x/1000,y,p.z/1000);});
  }
  async loadBed(product,placement){return this.loadFurniture(product,placement,'bed');}
  async loadFurniture(product,placement,mask){
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(blob:|data:)/.test(url))return url;const u=new URL(url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/decoders/'))return url;throw new Error('Нужен GLB со встроенными текстурами. Откройте модель в каталоге.');});
    const draco=new DRACOLoader(manager).setDecoderPath('/decoders/draco/'),ktx=new KTX2Loader(manager).setTranscoderPath('/decoders/basis/').detectSupport(this.renderer);
    const loader=new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
    const buffer=await productBuffer(product);
    try{
      const gltf=await loader.parseAsync(buffer,'');const oriented=new THREE.Group();oriented.add(gltf.scene);
      if(product.normalization?.rotationQuaternion)oriented.quaternion.fromArray(product.normalization.rotationQuaternion);
      const normalized=new THREE.Group();normalized.add(oriented);normalized.scale.setScalar(product.normalization?.uniformScale||1);normalized.updateWorldMatrix(true,true);
      const b=new THREE.Box3().setFromObject(normalized,true);if(b.isEmpty()||![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite))throw new Error('Не удалось определить габариты модели.');
      const center=b.getCenter(new THREE.Vector3());normalized.position.set(-center.x,-b.min.y,-center.z);
      const group=new THREE.Group();group.add(normalized);group.position.set(placement.x/1000,0,placement.z/1000);group.rotation.y=-placement.rotation*Math.PI/180;
      group.traverse(o=>{if(o.isMesh){o.userData.mask=mask;o.castShadow=true;o.receiveShadow=true;}});this.scene.add(group);this.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(group,true);
      if(mask==='bed'){this.bed=group;this.sourceBuffer=buffer;this.bedBounds=bounds;}
      else{this.furniture.push({group,bounds,product,placement,mask});this.extraBuffers.set(product.id,buffer);const color=['#dd5533','#3388ee','#66bb33','#eecc22'][this.furniture.length-1];this.maskMaterials[mask]=new THREE.MeshBasicMaterial({color,toneMapped:false,side:THREE.DoubleSide});}
    }finally{draco.dispose();ktx.dispose();}
  }
  setCamera(c){const result=applyLevelCamera(this.camera,c);this.depthUniforms.captureNear.value=this.camera.near;return result;}
  inspectFrame(c){
    this.setCamera(c);const main=frameMetrics(this.camera,this.bedBounds,this.architecture.children),all=[main,...this.furniture.map(f=>frameMetrics(this.camera,f.bounds,this.architecture.children))];
    const inside=this.furniture.some(f=>{const b=f.bounds;return this.camera.position.x>b.min.x-.12&&this.camera.position.x<b.max.x+.12&&this.camera.position.z>b.min.z-.12&&this.camera.position.z<b.max.z+.12;});
    return {...main,...(c.composition==='architecture'?{architecture:this.architectureContext(c)}:{}),fits:all.every(m=>m.fits),blocked:inside||all.some(m=>m.blocked),minX:Math.min(...all.map(m=>m.minX)),maxX:Math.max(...all.map(m=>m.maxX)),minY:Math.min(...all.map(m=>m.minY)),maxY:Math.max(...all.map(m=>m.maxY))};
  }
  maskPalette(){return {...MASKS,...Object.fromEntries(this.furniture.map(f=>[f.mask,'#'+this.maskMaterials[f.mask].color.getHexString()]))};}
  passMaterial(base,original){
    const side=(Array.isArray(original)?original[0]:original)?.side??THREE.FrontSide;
    if(base.side===side)return base;
    let variants=this.passMaterialVariants.get(base);if(!variants){variants=new Map();this.passMaterialVariants.set(base,variants);}
    if(!variants.has(side)){const m=base.clone();m.side=side;m.onBeforeCompile=base.onBeforeCompile;variants.set(side,m);}
    return variants.get(side);
  }
  visualCenter(c,onlyMask=null){
    this.setCamera(c);const originals=[],target=this.renderer.getRenderTarget(),background=this.scene.background,shadows=this.renderer.shadowMap.enabled;
    try{
      this.scene.background=new THREE.Color(0);this.renderer.shadowMap.enabled=false;
      this.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material]);const base=(onlyMask==='__scene__'||(onlyMask?o.userData.mask===onlyMask:(o.userData.mask==='bed'||o.userData.mask?.startsWith('furniture-'))))?this.balanceWhite:this.balanceBlack;o.material=this.passMaterial(base,o.material);}});
      this.renderer.setRenderTarget(this.balanceTarget);this.renderer.render(this.scene,this.camera);
      this.renderer.readRenderTargetPixels(this.balanceTarget,0,0,192,256,this.balancePixels);
      return silhouetteCenter(this.balancePixels,192,256);
    }finally{for(const[o,m]of originals)o.material=m;this.scene.background=background;this.renderer.shadowMap.enabled=shadows;this.renderer.setRenderTarget(target);}
  }
  furnitureVisibility(c){return this.furniture.map(f=>({instanceId:f.placement.id,visibleAreaFraction:this.visualCenter(c,f.mask)?.area||0}));}
  hasCompleteRoomFrame(c){return c.clipMode!=='room-entry'||(this.visualCenter(c,'__scene__')?.area||0)>=.995;}
  architectureContext(c){
    this.setCamera(c);const frames=projectedGroup(this.camera,[this.bedBounds,...this.furniture.map(f=>f.bounds)]);
    const projectedDoorArea=polygonArea(this.doorCorners.map(p=>p.clone().project(this.camera)));
    const doorArea=this.visualCenter(c,'door')?.area||0;
    const walls=Object.fromEntries(['wallLeft','wallRight','wallTop','wallBottom'].map(id=>[id,this.visualCenter(c,id)?.area||0]));
    this.setCamera(c);return {...frames,doorArea,doorVisibleRatio:Math.min(1,doorArea/Math.max(projectedDoorArea,1e-9)),wallAreas:walls,corners:cornerInFrame(this.camera,this.room,this.heights,walls),doorState:'closed'};
  }
  balanceArchitectureCamera(candidate){
    this.setCamera(candidate);const m=projectedGroup(this.camera,[this.bedBounds,...this.furniture.map(f=>f.bounds)]);
    const c={...candidate,shiftX:(candidate.shiftX||0)+(m.minX+m.maxX)/4,shiftY:(candidate.shiftY||0)-(m.minY+m.maxY)/4};
    if(Math.abs(c.shiftX)>.35||Math.abs(c.shiftY)>.35)return null;
    if(!this.hasCompleteRoomFrame(c))return null;
    const context=this.architectureContext(c);if(architectureError(context))return null;
    return {...c,architectureContext:context,visualBalance:{method:'furniture_bounds',x:.5,y:.5}};
  }
  balanceCamera(candidate){
    if(candidate.composition==='architecture')return this.balanceArchitectureCamera(candidate);
    for(let fov=candidate.fov;fov<=65;fov=Math.min(65,fov+5)){
      let c={...candidate,fov};let center;
      for(let i=0;i<4;i++){center=this.visualCenter(c);if(!center)break;if(isCentered(center))break;c=centeredShift(c,center);}
      center=this.visualCenter(c);const frame=this.inspectFrame(c);
      if(isCentered(center)&&frame.fits&&!frame.blocked&&this.hasCompleteRoomFrame(c))return {...c,visualBalance:{...center,method:'silhouette_centroid',tolerance:.015}};
      if(fov===65)break;
    }
    return null;
  }
  render(c,pass='rgb',width=0){
    this.setCamera(c);const w=width||Math.max(320,Math.round(this.host.clientWidth*Math.min(devicePixelRatio,2)));this.renderer.setSize(w,Math.round(w/ASPECT),false);
    const originals=[];const bg=this.scene.background,tone=this.renderer.toneMapping,colorSpace=this.renderer.outputColorSpace;
    try{
      if(pass!=='rgb'){
        this.scene.background=new THREE.Color('#000000');this.renderer.toneMapping=THREE.NoToneMapping;
        if(pass==='depth')this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
        this.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material]);o.material=this.passMaterial(pass==='depth'?this.depth:this.maskMaterials[o.userData.mask]||this.maskMaterials.bed,o.material);}});
      }
      this.renderer.render(this.scene,this.camera);
    }finally{for(const[o,mat]of originals)o.material=mat;this.scene.background=bg;this.renderer.toneMapping=tone;this.renderer.outputColorSpace=colorSpace;}
  }
  capture(c,pass='rgb',width=FRAME_WIDTH){this.render(c,pass,width);return this.renderer.domElement.toDataURL('image/png');}
  cameraMetadata(c){const leveled=this.setCamera(c);return {clipping:{mode:c.clipMode||'none',nearMeters:this.camera.near,affects:'all render passes; room and furniture transforms unchanged'},horizonLocked:true,pitchDegrees:0,rollDegrees:0,horizontalShiftFraction:leveled.shiftX||0,verticalShiftFraction:leveled.shiftY,visualBalance:c.visualBalance,architectureContext:c.composition==='architecture'?this.architectureContext(c):null,furnitureVisibility:this.furnitureVisibility(c),viewOffset:{...this.camera.view},positionMeters:this.camera.position.toArray(),quaternion:this.camera.quaternion.toArray(),targetMeters:cameraTarget(c),verticalFovDegrees:c.fov,aspect:ASPECT,nearMeters:this.camera.near,farMeters:this.camera.far,projectionMatrix:this.camera.projectionMatrix.toArray()};}
}
