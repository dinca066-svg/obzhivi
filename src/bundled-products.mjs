// Supplier dimensions are distinct from the approximate image-derived mesh.
const scale=.470/(.9491239786148071+.9517890214920044);
export const GRV_NIGHTSTAND={
  id:'grv-103724742948',uniqueKey:'grv\u001fym-103724742948',name:'Тумба GRV с ящиком, терракотовая',manufacturer:'GRV',sku:'YM-103724742948',category:'nightstand',finish:'Терракотовый корпус · чёрные ножки и ручка',
  productUrl:'https://market.yandex.ru/card/tumba-prikrovatnaya-na-nozhkakh-s-yashchikom/103724742948',
  dimensionsMm:{width:450,depth:400,height:470},
  measuredDimensionsMm:{width:1.8405320048332214*scale*1000,depth:1.6782339811325073*scale*1000,height:470},
  dimensionsSource:'seller_specifications',modelApproximate:true,visualVerified:false,
  normalization:{uniformScale:scale,rotationQuaternion:[0,0,0,1],origin:'floor_center'},
  sourceGlbPath:'/models/grv-nightstand.glb',sourceFileName:'Meshy_AI_Retro_Rust_Nightstand_1111152644_texture.glb',
  photoPath:'/photos/grv-nightstand.jpg',createdAt:'2026-11-11T15:30:00Z',updatedAt:'2026-11-11T15:30:00Z'
};
export async function productBuffer(product){
  if(product.sourceGlb)return product.sourceGlb.arrayBuffer();
  const path=product.sourceGlbPath||(product.id==='demo-bed'?'/examples/bed.glb':null);
  if(!path||!/^\/(models|examples)\/[a-z0-9.-]+\.glb$/i.test(path))throw new Error('У товара нет доступной GLB-модели.');
  const response=await fetch(path);if(!response.ok)throw new Error('Не удалось загрузить модель мебели.');return response.arrayBuffer();
}

export const SHANE_BED={id:'shane-5971077429',uniqueKey:'melatika\u001fym-5971077429',name:'Кровать Shane 160×200 с подъёмным механизмом',manufacturer:'Melatika',sku:'YM-5971077429',category:'bed',finish:'Белый велюр · чёрный кант',productUrl:'https://market.yandex.ru/card/krovat-shane-160kh200-dvuspalnaya-s-podyemnym-mekhanizmom-na-nozhkakh-obivka-velyur-belyy-velutto-soft-100-kant-chernyy/5971077429',dimensionsMm:{width:1720,depth:2120,height:1000},measuredDimensionsMm:{width:1728,depth:2101.5,height:1004.1},modelApproximate:true,visualVerified:false,normalization:{uniformScale:1.1051843054911268,rotationQuaternion:[0,0,0,1],origin:'floor_center'},sourceGlbPath:'/models/shane-bed.glb',sourceFileName:'Meshy_AI_Ivory_Wave_Bed_1111130734_texture.glb',createdAt:'2026-11-13T10:00:00Z',updatedAt:'2026-11-13T10:00:00Z'};
export const BUNDLED_PRODUCTS=[GRV_NIGHTSTAND,SHANE_BED];
