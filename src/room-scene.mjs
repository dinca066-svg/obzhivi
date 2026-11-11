import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { openingsFor, wallCells, cameraTarget, ASPECT } from './scene-core.mjs';
import { frameMetrics } from './frame-metrics.mjs';
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
    this.architecture=new THREE.Group();this.scene.add(this.architecture);this.bed=null;
    this.maskMaterials=Object.fromEntries(Object.entries(MASKS).map(([id,color])=>[id,new THREE.MeshBasicMaterial({color,toneMapped:false,side:THREE.DoubleSide})]));
    this.depth=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,side:THREE.DoubleSide});
    this.depthUniforms={captureNear:{value:this.camera.near},captureFar:{value:this.camera.far}};
    this.depth.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.depthUniforms);shader.fragmentShader='uniform float captureNear;\nuniform float captureFar;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );','float viewDepth = (captureNear * captureFar) / (captureFar - fragCoordZ * (captureFar - captureNear));\n gl_FragColor = vec4(vec3(1.0 - clamp((viewDepth-captureNear)/(captureFar-captureNear),0.0,1.0)),1.0);');};
  }
  box(parent,size,position,color,mask){const material=new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0});const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.userData.mask=mask;mesh.receiveShadow=mask==='floor';parent.add(mesh);return mesh;}
  buildRoom(room,h){
    this.architecture.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});this.architecture.clear();
    const w=room.width/1000,d=room.depth/1000,H=h.ceiling/1000;
    this.keyLight.target.position.set(w/2,0,d/2);this.camera.far=Math.ceil(Math.hypot(w,d,H)+1);this.depthUniforms.captureFar.value=this.camera.far;
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
    const leaf=this.box(this.architecture,[.04,h.door/1000,room.doorWidth/1000],[(dg.closed.x+dg.hinge.x)/2000,h.door/2000,(dg.closed.z+dg.hinge.z)/2000],'#d6c7ae','door');leaf.rotation.y=Math.atan2(dx,dz);leaf.userData.doorState='closed';this.scene.updateMatrixWorld(true);
  }
  async loadBed(product,placement){
    const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(/^(blob:|data:)/.test(url))return url;const u=new URL(url,location.href);if(u.origin===location.origin&&u.pathname.startsWith('/decoders/'))return url;throw new Error('Нужен GLB со встроенными текстурами. Откройте модель в каталоге.');});
    const draco=new DRACOLoader(manager).setDecoderPath('/decoders/draco/'),ktx=new KTX2Loader(manager).setTranscoderPath('/decoders/basis/').detectSupport(this.renderer);
    const loader=new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
    let buffer;if(product.sourceGlb)buffer=await product.sourceGlb.arrayBuffer();else if(product.id==='demo-bed'){const r=await fetch('/examples/bed.glb');if(!r.ok)throw new Error('Учебная модель недоступна.');buffer=await r.arrayBuffer();}else throw new Error('У выбранного товара нет GLB. Добавьте модель в каталоге.');
    try{
      const gltf=await loader.parseAsync(buffer,'');const oriented=new THREE.Group();oriented.add(gltf.scene);
      if(product.normalization?.rotationQuaternion)oriented.quaternion.fromArray(product.normalization.rotationQuaternion);
      const normalized=new THREE.Group();normalized.add(oriented);normalized.scale.setScalar(product.normalization?.uniformScale||1);normalized.updateWorldMatrix(true,true);
      const b=new THREE.Box3().setFromObject(normalized,true);if(b.isEmpty()||![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite))throw new Error('Не удалось определить габариты модели.');
      const center=b.getCenter(new THREE.Vector3());normalized.position.set(-center.x,-b.min.y,-center.z);
      this.bed=new THREE.Group();this.bed.add(normalized);this.bed.position.set(placement.x/1000,0,placement.z/1000);this.bed.rotation.y=-placement.rotation*Math.PI/180;
      this.bed.traverse(o=>{if(o.isMesh){o.userData.mask='bed';o.castShadow=true;o.receiveShadow=true;}});this.scene.add(this.bed);this.scene.updateMatrixWorld(true);
      this.sourceBuffer=buffer;this.bedBounds=new THREE.Box3().setFromObject(this.bed,true);
    }finally{draco.dispose();ktx.dispose();}
  }
  setCamera(c){return applyLevelCamera(this.camera,c);}
  inspectFrame(c){this.setCamera(c);return frameMetrics(this.camera,this.bedBounds,this.architecture.children);}
  render(c,pass='rgb',width=0){
    this.setCamera(c);const w=width||Math.max(320,Math.round(this.host.clientWidth*Math.min(devicePixelRatio,2)));this.renderer.setSize(w,Math.round(w/ASPECT),false);
    const originals=[];const bg=this.scene.background,tone=this.renderer.toneMapping,colorSpace=this.renderer.outputColorSpace;
    try{
      if(pass!=='rgb'){
        this.scene.background=new THREE.Color('#000000');this.renderer.toneMapping=THREE.NoToneMapping;
        if(pass==='depth')this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
        this.scene.traverse(o=>{if(o.isMesh){originals.push([o,o.material]);o.material=pass==='depth'?this.depth:this.maskMaterials[o.userData.mask]||this.maskMaterials.bed;}});
      }
      this.renderer.render(this.scene,this.camera);
    }finally{for(const[o,mat]of originals)o.material=mat;this.scene.background=bg;this.renderer.toneMapping=tone;this.renderer.outputColorSpace=colorSpace;}
  }
  capture(c,pass='rgb',width=1600){this.render(c,pass,width);return this.renderer.domElement.toDataURL('image/png');}
  cameraMetadata(c){const leveled=this.setCamera(c);return {horizonLocked:true,pitchDegrees:0,rollDegrees:0,verticalShiftFraction:leveled.shiftY,viewOffset:{...this.camera.view},positionMeters:this.camera.position.toArray(),quaternion:this.camera.quaternion.toArray(),targetMeters:cameraTarget(c),verticalFovDegrees:c.fov,aspect:ASPECT,nearMeters:this.camera.near,farMeters:this.camera.far,projectionMatrix:this.camera.projectionMatrix.toArray()};}
}
