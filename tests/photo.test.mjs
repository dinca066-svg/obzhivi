import test from 'node:test';import assert from 'node:assert/strict';
import {productPhoto,SHANE_SOURCE} from '../src/product-photo.mjs';
test('real photo is independent of a mesh screenshot, defaults match only the exact product',()=>{
  assert.equal(productPhoto({thumbnail:'data:image/jpeg;base64,YQ=='}),null);
  assert.equal(productPhoto({productUrl:SHANE_SOURCE}).src,'/photos/shane-seller.jpg');
  assert.equal(productPhoto({productUrl:SHANE_SOURCE.replace('5971077429','123')}),null);
  assert.equal(productPhoto({photoDataUrl:'data:image/png;base64,YQ=='}).src,'data:image/png;base64,YQ==');
  assert.equal(productPhoto({photoDataUrl:'data:image/svg+xml;base64,YQ=='}),null);
  assert.equal(productPhoto({productUrl:SHANE_SOURCE,photoRemoved:true}),null);
});
