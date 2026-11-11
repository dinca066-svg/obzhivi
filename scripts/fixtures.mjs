import { BoxGeometry } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
export function makeBedGlb(scale = 1, depthFactor = 1) {
  const parts = [
    ['Каркас',[1.8,.3,2.05],[0,.28,.075],0],['Изголовье',[1.8,1.1,.15],[0,.55,-1.025],0],
    ['Матрас',[1.6,.22,1.9],[0,.54,.1],1],['Подушка 1',[.7,.12,.4],[-.4,.71,-.57],1],['Подушка 2',[.7,.12,.4],[.4,.71,-.57],1],
    ...[-.7,.7].flatMap(x=>[-.85,.85].map(z=>['Ножка',[.09,.13,.09],[x,.065,z],2]))
  ];
  const document={asset:{version:'2.0',generator:'Obzhivi educational fixture'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Учебная кровать',scale:[scale,scale,scale],children:[]}],meshes:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[],materials:[{name:'Обивка',pbrMetallicRoughness:{baseColorFactor:[.36,.43,.28,1],roughnessFactor:.9,metallicFactor:0}},{name:'Текстиль',pbrMetallicRoughness:{baseColorFactor:[.88,.86,.79,1],roughnessFactor:1,metallicFactor:0}},{name:'Ножки',pbrMetallicRoughness:{baseColorFactor:[.14,.1,.06,1],roughnessFactor:.8,metallicFactor:0}}]};
  const binary=[];let byteOffset=0;
  function add(array,type,componentType,min,max){const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const padding=(4-bytes.length%4)%4;const view=document.bufferViews.length;document.bufferViews.push({buffer:0,byteOffset,byteLength:bytes.length});binary.push(bytes,Buffer.alloc(padding));byteOffset+=bytes.length+padding;const accessor=document.accessors.length;document.accessors.push({bufferView:view,componentType,count:array.length/(type==='VEC3'?3:1),type,...(min?{min,max}:{})});return accessor;}
  for(const[name,size,position,material]of parts){const g=new BoxGeometry(size[0],size[1],size[2]*depthFactor);g.computeBoundingBox();const pos=add(g.attributes.position.array,'VEC3',5126,g.boundingBox.min.toArray(),g.boundingBox.max.toArray()),normal=add(g.attributes.normal.array,'VEC3',5126),indices=add(g.index.array,'SCALAR',5123);const mesh=document.meshes.length;document.meshes.push({primitives:[{attributes:{POSITION:pos,NORMAL:normal},indices,material}]});document.nodes[0].children.push(document.nodes.length);document.nodes.push({name,mesh,translation:[position[0],position[1],position[2]*depthFactor]});g.dispose();}
  document.buffers[0].byteLength=byteOffset;const jsonRaw=Buffer.from(JSON.stringify(document)),json=Buffer.concat([jsonRaw,Buffer.alloc((4-jsonRaw.length%4)%4,32)]),bin=Buffer.concat(binary);const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);const j=Buffer.alloc(8),b=Buffer.alloc(8);j.writeUInt32LE(json.length);j.writeUInt32LE(0x4e4f534a,4);b.writeUInt32LE(bin.length);b.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,j,json,b,bin]);
}
await mkdir('public/examples',{recursive:true});
await writeFile('public/examples/bed.glb',makeBedGlb());
await writeFile('public/examples/bed-100x.glb',makeBedGlb(100));
