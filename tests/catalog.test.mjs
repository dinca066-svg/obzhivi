import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { compareDimensions, inspectGlb, itemKey, validateCard, safeProductUrl } from '../src/core.mjs';
import { makeBedGlb } from '../scripts/fixtures.mjs';

const target = { width: 1800, depth: 2200, height: 1100 };
test('seller links preserve product URLs and block executable or credential-bearing URLs', () => {
  const url = 'https://market.yandex.ru/card/bed/5971077429?offer=white';
  assert.equal(safeProductUrl(url), url);
  for (const bad of ['javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:secret@example.com', 'bad address']) assert.equal(safeProductUrl(bad), null);
  assert.ok(validateCard({name:'Кровать',manufacturer:'Бренд',sku:'1',dimensionsMm:target,productUrl:'javascript:alert(1)'}));
});
const asArrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
function jsonGlb(document) {
  const text = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return asArrayBuffer(Buffer.concat([header, json]));
}
const measure = root => {
  root.updateWorldMatrix(true, true);
  const size = new Box3().setFromObject(root, true).getSize(new Vector3());
  return { width: size.x * 1000, depth: size.z * 1000, height: size.y * 1000 };
};
test('correct dimensions match; invalid dimensions cannot pass', () => {
  assert.equal(compareDimensions(target, target).status, 'match');
  for (const invalid of [0, NaN, Infinity, 50001]) assert.equal(compareDimensions(target, {...target, width: invalid}).status, 'incomplete');
});
test('uniform unit error is corrected across all axes, without distorting the object', async () => {
  const file = asArrayBuffer(makeBedGlb(100));
  inspectGlb(file);
  const gltf = await new GLTFLoader().parseAsync(file, '');
  const root = new Group(); root.add(gltf.scene);
  const result = compareDimensions(measure(root), target);
  assert.equal(result.status, 'uniform_scale');
  assert.ok(Math.abs(result.factor - .01) < 1e-7);
  root.scale.setScalar(result.factor);
  assert.equal(compareDimensions(measure(root), target).status, 'match');
  const box = new Box3().setFromObject(root, true), center = box.getCenter(new Vector3());
  root.position.set(-center.x, -box.min.y, -center.z); root.updateWorldMatrix(true, true);
  const normalized = new Box3().setFromObject(root, true);
  assert.ok(Math.abs(normalized.min.y) < 1e-8);
  assert.ok(normalized.getCenter(new Vector3()).setY(0).length() < 1e-8);
});
test('wrong proportions cannot be fixed by uniform scaling', async () => {
  const gltf = await new GLTFLoader().parseAsync(asArrayBuffer(makeBedGlb(1, 1.4)), '');
  assert.equal(compareDimensions(measure(gltf.scene), target).status, 'proportion_mismatch');
});
test('tolerance must hold on all axes after the proposed scale', () => {
  const actual = { width: 180000, depth: 221000, height: 109500 };
  const result = compareDimensions(actual, target);
  assert.equal(result.status, 'uniform_scale');
  assert.equal(compareDimensions(Object.fromEntries(Object.entries(actual).map(([key, value]) => [key, value * result.factor])), target).status, 'match');
});
test('GLB validation rejects corrupt headers, external resources and dynamic objects', () => {
  const file = asArrayBuffer(makeBedGlb());
  assert.equal(inspectGlb(file).asset.version, '2.0');
  new DataView(file).setUint32(8, 999, true);
  assert.throws(() => inspectGlb(file), /повреждён/);
  const base = { asset: { version: '2.0' }, meshes: [{ primitives: [] }], nodes: [{}] };
  assert.throws(() => inspectGlb(jsonGlb({...base, images: [{ uri: 'https://example.org/texture.png' }] })), /внешние/);
  assert.throws(() => inspectGlb(jsonGlb({...base, animations: [{}] })), /статичную/);
  assert.throws(() => inspectGlb(jsonGlb({...base, nodes: [{children: [0]}] })), /вложенность/);
});
test('catalog requires identifying information and normalizes duplicate keys', () => {
  assert.equal(itemKey('  Фабрика ', 'BED-1'), itemKey('фабрика', 'bed-1'));
  assert.ok(validateCard({ name: '', manufacturer: 'Фабрика', sku: 'bed', dimensionsMm: target }));
  assert.equal(validateCard({ name: 'Кровать', manufacturer: 'Фабрика', sku: 'bed', dimensionsMm: target }), null);
});
