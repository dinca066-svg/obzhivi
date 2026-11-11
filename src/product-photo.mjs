export const SHANE_SOURCE='https://market.yandex.ru/card/krovat-shane-160kh200-dvuspalnaya-s-podyemnym-mekhanizmom-na-nozhkakh-obivka-velyur-belyy-velutto-soft-100-kant-chernyy/5971077429';
export function productPhoto(product){
  if(product.photoRemoved)return null;
  if(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(product.photoDataUrl||''))return {src:product.photoDataUrl,sourceUrl:null,label:'Фото товара'};
  let matches=false;try{const u=new URL(product.productUrl);matches=u.hostname==='market.yandex.ru'&&u.pathname.endsWith('/5971077429');}catch{}
  if(matches)return {src:'/photos/shane-seller.jpg',sourceUrl:SHANE_SOURCE,label:'Фото из карточки продавца'};
  return null;
}
