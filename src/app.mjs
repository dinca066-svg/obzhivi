import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { zipSync, strToU8 } from 'fflate';
import { inspectGlb, compareDimensions, itemKey, validateCard, safeStem, safeProductUrl, MAX_FILE_BYTES, AXES } from './core.mjs';
import { listProducts, saveProduct } from './db.mjs';

const $ = id => document.getElementById(id);
const fmt = (n, digits = 0) => (Math.abs(n) < .5 * 10 ** -digits ? 0 : n).toLocaleString('ru-RU', { maximumFractionDigits: digits });
const labels = { width: 'Ширина', depth: 'Глубина', height: 'Высота' };
let renderer, scene, camera, controls, floor, bounds, orientation, asset, normalRoot, environment;
let sourceBuffer = null, fileName = '', currentId = null, scaleFactor = 1, actual = null;
let comparison = { status: 'incomplete', rows: [] }, loading = false, saving = false, dirty = true, token = 0, demo = false;
let products = [], activeView = 'perspective';

function notice(text, error = false) {
  const el = $('notice'); el.textContent = text; el.hidden = !text;
  el.classList.toggle('error', error); el.setAttribute('role', error ? 'alert' : 'status');
}
function card() {
  return { name: $('name').value.trim(), manufacturer: $('manufacturer').value.trim(), sku: $('sku').value.trim(),
    category: $('category').value, finish: $('finish').value.trim(), productUrl: $('productUrl').value.trim(),
    dimensionsMm: Object.fromEntries(AXES.map(axis => [axis, Number($(axis).value)])) };
}
function setFields(value) {
  for (const key of ['name','manufacturer','sku','category','finish','productUrl']) $(key).value = value?.[key] || (key === 'category' ? 'bed' : '');
  for (const axis of AXES) $(axis).value = value?.dimensionsMm?.[axis] || '';
}
function setBusy(value) {
  loading = value; $('viewer-loading').hidden = !value;
  for (const id of ['file','new-product','example','example-large']) $(id).disabled = value || saving;
  document.querySelectorAll('[data-rotate]').forEach(button => button.disabled = value || !normalRoot);
  $('reset-transform').disabled = value || !normalRoot; refreshCheck();
}
function markDirty(appearance = false) { dirty = true; if (appearance) $('visual-check').checked = false; refreshCheck(); }
function initViewer() {
  scene = new THREE.Scene(); scene.background = new THREE.Color('#ecefe4');
  camera = new THREE.PerspectiveCamera(38, 1, .01, 10000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('viewport').append(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.maxPolarAngle = Math.PI * .49; controls.enablePan = true;
  controls.addEventListener('change', render);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a947a, .65));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(4, 7, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xf2eadb, .45); fill.position.set(-4, 3, -3); scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .35; room.dispose(); pmrem.dispose();
  floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#e4e9da', roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.002; scene.add(floor);
  bounds = new THREE.Box3Helper(new THREE.Box3(), '#74885c'); bounds.visible = false; scene.add(bounds);
  new ResizeObserver(() => { const el = $('viewport'); renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); render(); }).observe($('viewport'));
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); notice('Браузер потерял 3D-контекст. Сохранённые товары остаются в каталоге; обновите страницу.', true); });
}
function render() { if (renderer && scene && camera) renderer.render(scene, camera); }
function disposeObject(object) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  object?.traverse(child => { if (child.geometry) geometries.add(child.geometry); for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) materials.add(material); });
  for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
  for (const texture of textures) { texture.source?.data?.close?.(); texture.dispose(); } for (const geometry of geometries) geometry.dispose();
}
function clearAsset() {
  if (normalRoot) { scene.remove(normalRoot); disposeObject(normalRoot); }
  normalRoot = orientation = asset = null; sourceBuffer = null; actual = null; currentId = null; fileName = ''; scaleFactor = 1; demo = false; dirty = true;
  if (bounds) bounds.visible = false;
  $('visual-check').checked = false; $('viewer-placeholder').hidden = false;
  $('model-title').textContent = 'Модель товара'; $('file-label').textContent = 'Загрузите GLB или откройте учебную модель.'; $('model-label').textContent = 'GLB 2.0';
  $('normalization-note').textContent = 'В сцене: 1 единица = 1 метр.'; refreshCheck(); render();
}
function alignAndMeasure() {
  normalRoot.position.set(0, 0, 0); normalRoot.scale.setScalar(scaleFactor); normalRoot.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(normalRoot, true);
  if (box.isEmpty() || ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error('В модели не удалось измерить конечные габариты.');
  const center = box.getCenter(new THREE.Vector3());
  normalRoot.position.set(-center.x, -box.min.y, -center.z); normalRoot.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(normalRoot, true);
  const size = box.getSize(new THREE.Vector3());
  if (Math.min(size.x, size.y, size.z) <= 0) throw new Error('Нужен объёмный предмет: один из габаритов равен нулю.');
  actual = { width: size.x * 1000, depth: size.z * 1000, height: size.y * 1000 };
  bounds.box.copy(box); bounds.visible = $('show-bounds').checked;
  const extent = Math.max(size.x, size.y, size.z);
  floor.scale.setScalar(extent * 2.5); floor.position.y = -Math.max(.0001, extent * .001);
  $('normalization-note').textContent = `Единый масштаб: ×${fmt(scaleFactor, 8)}. Основание — на полу; центр — X=0, Z=0.`;
  return { box, size, extent };
}
function frame(view = activeView) {
  if (!normalRoot) return; activeView = view;
  const { box, extent } = alignAndMeasure(), center = box.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov), horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = extent / (2 * Math.tan(Math.min(verticalFov, horizontalFov) / 2)) * 1.8;
  const directions = { perspective: [1.4, 1, 1.6], front: [0, .13, 1], side: [1, .13, 0], top: [0, 1, .001] };
  camera.near = Math.max(extent / 10000, .000001); camera.far = Math.max(100, distance * 100); camera.updateProjectionMatrix();
  camera.position.copy(center).add(new THREE.Vector3(...directions[view]).normalize().multiplyScalar(distance));
  controls.target.copy(center); controls.minDistance = extent * .2; controls.maxDistance = distance * 10; controls.update();
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view))); render();
}
function createLoader() {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/.test(url)) return url;
    const parsed = new URL(url, location.href);
    if (parsed.origin === location.origin && parsed.pathname.startsWith('/decoders/')) return url;
    throw new Error('Модель ссылается на внешний файл. Встройте все ресурсы в GLB.');
  });
  const loader = new GLTFLoader(manager), draco = new DRACOLoader(manager).setDecoderPath('/decoders/draco/');
  const ktx = new KTX2Loader(manager).setTranscoderPath('/decoders/basis/').detectSupport(renderer);
  loader.setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
  return { loader, dispose: () => { draco.dispose(); ktx.dispose(); } };
}
async function loadBuffer(buffer, name, { record = null, isDemo = false } = {}) {
  const ticket = ++token; setBusy(true); notice(''); clearAsset();
  let parsed, gltf, loaders;
  try {
    parsed = inspectGlb(buffer); if (!renderer) throw new Error('3D-просмотр недоступен в этом браузере.');
    loaders = createLoader(); gltf = await loaders.loader.parseAsync(buffer.slice(0), '');
    if (ticket !== token) { disposeObject(gltf.scene); return; }
    asset = gltf.scene; let meshCount = 0;
    asset.traverse(child => { if (child.isMesh) meshCount++; });
    if (!meshCount) throw new Error('В активной сцене нет видимых предметов.');
    normalRoot = new THREE.Group(); normalRoot.name = 'Product'; orientation = new THREE.Group(); orientation.name = 'Orientation'; orientation.add(asset); normalRoot.add(orientation); scene.add(normalRoot);
    scaleFactor = record?.normalization?.uniformScale || 1;
    if (record?.normalization?.rotationQuaternion) orientation.quaternion.fromArray(record.normalization.rotationQuaternion);
    alignAndMeasure(); sourceBuffer = buffer; fileName = name; currentId = record?.id || null; demo = isDemo || !!record?.demo; dirty = !record;
    $('viewer-placeholder').hidden = true; $('model-title').textContent = record?.name || (demo ? 'Учебная кровать' : name.replace(/\.glb$/i, ''));
    $('file-label').textContent = `${name} · ${fmt(buffer.byteLength / 1024 / 1024, 2)} МБ · объектов: ${meshCount}`;
    $('model-label').textContent = demo ? 'Учебная модель' : 'GLB 2.0';
    if (record) { setFields(record); $('visual-check').checked = !!record.visualVerified; }
    frame('perspective');
    if (parsed.extensionsUsed?.includes('KHR_materials_variants')) notice('В файле есть варианты материалов. Просмотрена базовая отделка; сохраняйте карточку именно для неё.');
  } catch (error) {
    if (ticket !== token) return;
    clearAsset(); notice(error.message || 'Не удалось открыть GLB. Проверьте файл в Blender.', true);
  } finally { loaders?.dispose(); if (ticket === token) setBusy(false); }
}
function refreshCheck() {
  const rawUrl = $('productUrl').value.trim(), url = safeProductUrl(rawUrl);
  $('product-url-error').hidden = !rawUrl || !!url;
  $('productUrl').setAttribute('aria-invalid', String(!!rawUrl && !url));
  $('seller-preview').hidden = !url;
  if (url) { $('seller-preview').href = url; $('seller-preview').textContent = `Посмотреть у продавца ↗ · ${new URL(url).hostname}`; }
  else $('seller-preview').removeAttribute('href');
  comparison = actual ? compareDimensions(actual, card().dimensionsMm) : { status: 'no_model', rows: [], factor: null };
  const status = comparison.status;
  const chip = $('check-chip'); chip.className = 'chip';
  const messages = {
    no_model: ['Нужна модель','После загрузки измерим геометрию файла.'],
    incomplete: ['Укажите размеры','Заполните три внешних габарита в миллиметрах.'],
    match: ['Размеры совпадают','Геометрия соответствует указанным габаритам в пределах допуска.'],
    uniform_scale: ['Нужен масштаб','Пропорции согласованы. Можно исправить размер единым коэффициентом по всем осям.'],
    proportion_mismatch: ['Пропорции различаются','Единый масштаб не подходит. Проверьте ориентацию и размеры или исправьте модель в 3D-редакторе.']
  };
  chip.textContent = messages[status][0]; $('check-message').textContent = messages[status][1];
  chip.classList.toggle('match', status === 'match'); chip.classList.toggle('warning', status === 'uniform_scale'); chip.classList.toggle('error', status === 'proportion_mismatch');
  const tbody = $('comparison-body'); tbody.replaceChildren();
  for (const axis of AXES) {
    const row = comparison.rows.find(r => r.axis === axis), tr = document.createElement('tr');
    const values = [labels[axis], actual ? fmt(actual[axis], 1) : '—', row ? `${row.difference >= .05 ? '+' : ''}${fmt(row.difference, 1)} мм` : '—'];
    values.forEach((text, i) => { const td = document.createElement('td'); td.textContent = text; if (i === 2 && row && Math.abs(row.difference) > row.tolerance) td.className = 'bad'; tr.append(td); }); tbody.append(tr);
  }
  $('apply-scale').hidden = status !== 'uniform_scale'; $('apply-scale').disabled = loading || saving;
  if (status === 'uniform_scale') $('apply-scale').textContent = `Применить единый масштаб ×${fmt(comparison.factor, 8)}`;
  const ready = !loading && !saving && sourceBuffer && status === 'match' && !validateCard(card()) && $('visual-check').checked;
  $('save').disabled = !ready; $('save').textContent = saving ? 'Сохраняем…' : currentId ? 'Сохранить изменения' : 'Добавить в каталог';
  $('export').disabled = !ready || !currentId || dirty;
  document.querySelectorAll('[data-rotate]').forEach(button => button.disabled = loading || saving || !normalRoot);
  $('reset-transform').disabled = loading || saving || !normalRoot;
}
async function openExample(large = false) {
  if (loading || saving) return;
  setBusy(true);
  setFields({ name: 'Учебная кровать', manufacturer: 'Тестовый поставщик', sku: large ? 'DEMO-BED-100X' : 'DEMO-BED-160', category: 'bed', finish: 'Оливковая обивка · пример', dimensionsMm: { width: 1800, depth: 2200, height: 1100 } });
  try { const name = large ? 'bed-100x.glb' : 'bed.glb'; const response = await fetch('/examples/' + name); if (!response.ok) throw new Error('Не удалось открыть учебный файл.'); await loadBuffer(await response.arrayBuffer(), name, { isDemo: true }); }
  catch (error) { notice(error.message, true); }
  finally { setBusy(false); }
}
async function loadFile(file) {
  if (!file || loading || saving) return;
  if (!/\.glb$/i.test(file.name)) { notice('Выберите файл с расширением .glb.', true); return; }
  if (file.size > MAX_FILE_BYTES) { notice('Файл больше 50 МБ. Оптимизируйте модель и текстуры.', true); return; }
  const wasDemo = demo; if (wasDemo) setFields(null);
  try { await loadBuffer(await file.arrayBuffer(), file.name); if (sourceBuffer && !$('name').value) $('name').value = file.name.replace(/\.glb$/i, ''); refreshCheck(); }
  catch (error) { notice(error.message || 'Файл не прочитан.', true); }
}
function snapshotMetadata() {
  return { schemaVersion: 1, product: { id: currentId, ...card() },
    asset: { file: 'model.glb', format: 'glTF 2.0', units: 'metres', axes: { width: 'X', height: 'Y', depth: 'Z' }, origin: 'floor_center', placementScale: [1, 1, 1] },
    validation: { measuredDimensionsMm: actual, tolerance: { absoluteMm: 5, relative: .01 }, dimensionsMatch: comparison.status === 'match', visualVerified: $('visual-check').checked, checkedAt: new Date().toISOString() }, demo };
}
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function refreshCatalog() {
  try {
    products = await listProducts(); $('catalog-count').textContent = products.length ? `Сохранено товаров: ${products.length}. Нажмите на карточку, чтобы открыть.` : 'В локальном каталоге пока нет товаров.';
    const grid = $('catalog-grid'); grid.replaceChildren();
    for (const product of products) {
      const wrapper = document.createElement('article'); wrapper.className = 'product-card';
      const tile = document.createElement('button'); tile.className = 'product-tile'; tile.type = 'button'; tile.setAttribute('aria-label', `Открыть ${product.name}, ${product.sku}`);
      if (product.thumbnail) { const image = document.createElement('img'); image.src = product.thumbnail; image.alt = product.name; tile.append(image); }
      const body = document.createElement('div'); body.className = 'tile-body';
      for (const [tag,text,cls] of [['strong',product.name,''],['span',`${product.manufacturer} · ${product.sku}`,''],['span',`${product.dimensionsMm.width} × ${product.dimensionsMm.depth} × ${product.dimensionsMm.height} мм`,'tile-dimensions'],['span',product.demo?'Учебный товар · проверен':'Проверен · масштаб 1:1','']]) { const node = document.createElement(tag); node.textContent=text;node.className=cls;body.append(node); }
      tile.append(body); tile.onclick = async () => { if (loading || saving) return; await loadBuffer(await product.sourceGlb.arrayBuffer(), product.sourceFileName, { record: product }); $('product-form').scrollIntoView({ block: 'start', behavior: 'auto' }); }; wrapper.append(tile);
      const url = safeProductUrl(product.productUrl);
      if (url) {
        const link = document.createElement('a'); link.className = 'seller-link'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Посмотреть у продавца ↗'; link.setAttribute('aria-label', `Посмотреть у продавца: ${product.name}`); wrapper.append(link);
        const domain = document.createElement('span'); domain.className = 'seller-domain'; domain.textContent = new URL(url).hostname; wrapper.append(domain);
      }
      if(product.category==='bed') {const place=document.createElement('a');place.className='seller-link';place.href='/planner.html?product='+encodeURIComponent(product.id);place.textContent='Поставить в спальню →';wrapper.append(place);}
      grid.append(wrapper);
    }
  } catch (error) { notice('Локальное хранилище недоступно. Разрешите хранение данных для этого сайта: ' + error.message, true); }
}
document.querySelectorAll('#product-form input:not([type=checkbox]), #product-form select').forEach(input => input.addEventListener('input', () => markDirty(true)));
$('visual-check').addEventListener('change', () => markDirty());
$('show-bounds').addEventListener('change', () => { if (bounds) bounds.visible = !!normalRoot && $('show-bounds').checked; render(); });
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => frame(button.dataset.view));
document.querySelectorAll('[data-rotate]').forEach(button => button.onclick = () => {
  if (!normalRoot || loading || saving) return;
  const axes = {x:[1,0,0],y:[0,1,0],z:[0,0,1]}; orientation.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axes[button.dataset.rotate]), Math.PI/2));
  alignAndMeasure(); frame(); markDirty(true);
});
$('reset-transform').onclick = () => { if (!normalRoot || loading || saving) return; scaleFactor=1;orientation.quaternion.identity();alignAndMeasure();frame();markDirty(true);notice('Восстановлены исходные ориентация и масштаб. Проверьте габариты снова.'); };
$('apply-scale').onclick = () => { if (comparison.status !== 'uniform_scale' || loading || saving) return; const factor = comparison.factor; scaleFactor *= factor;alignAndMeasure();frame();markDirty(true);notice('Применён единый масштаб. Все пропорции сохранены; проверьте модель перед добавлением.'); };
$('file').onchange = async event => { await loadFile(event.target.files?.[0]); event.target.value=''; };
const drop=$('drop-zone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover');});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragover');});drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length!==1){notice('Загружайте по одному товару в одном GLB.',true);return;}loadFile(e.dataTransfer.files[0]);});
$('example').onclick=()=>openExample();$('example-large').onclick=()=>openExample(true);
$('new-product').onclick=()=>{if(loading||saving)return;token++;clearAsset();setFields(null);notice('Новая карточка. Загрузите GLB и укажите данные товара.');refreshCheck();$('name').focus();};
$('product-form').onsubmit = async event => {
  event.preventDefault(); refreshCheck(); if ($('save').disabled) return;
  const value = card(), key = itemKey(value.manufacturer,value.sku);
  if (products.some(p=>p.uniqueKey===key&&p.id!==currentId)) { notice('У этого производителя уже есть такой артикул. Откройте существующую карточку или укажите другой артикул комплектации.',true);return; }
  saving=true;setBusy(loading);
  try {
    frame('perspective');const wasVisible=bounds.visible;bounds.visible=false;render();const thumbnail=renderer.domElement.toDataURL('image/jpeg',.75);bounds.visible=wasVisible;render();
    const id=currentId||crypto.randomUUID(),existing=products.find(p=>p.id===id),now=new Date().toISOString();
    const product={id,uniqueKey:key,...value,sourceFileName:fileName,sourceGlb:new Blob([sourceBuffer],{type:'model/gltf-binary'}),normalization:{uniformScale:scaleFactor,rotationQuaternion:orientation.quaternion.toArray(),origin:'floor_center'},measuredDimensionsMm:{...actual},visualVerified:true,demo,thumbnail,createdAt:existing?.createdAt||now,updatedAt:now};
    await saveProduct(product);currentId=id;dirty=false;await refreshCatalog();notice('Товар сохранён в локальном каталоге. Можно скачать нормализованный GLB и карточку JSON одним архивом.');
  } catch(error) { notice(error.name==='ConstraintError'?'Этот артикул уже занят у производителя.':error.name==='QuotaExceededError'?'Недостаточно места в браузере. Освободите место и повторите сохранение.':'Не удалось сохранить товар: '+error.message,true); }
  finally { saving=false;setBusy(false); }
};
$('export').onclick=async()=>{
  if($('export').disabled)return;saving=true;refreshCheck();$('export').textContent='Готовим комплект…';
  try { normalRoot.userData={sku:card().sku,manufacturer:card().manufacturer,dimensionsMm:card().dimensionsMm};normalRoot.updateWorldMatrix(true,true);const glb=await new GLTFExporter().parseAsync(normalRoot,{binary:true,onlyVisible:true});const metadata=snapshotMetadata();const archive=zipSync({'model.glb':new Uint8Array(glb),'product.json':strToU8(JSON.stringify(metadata,null,2)),'README.txt':strToU8('Обживи — комплект товара\nmodel.glb: модель с применёнными ориентацией, единым масштабом и точкой установки на полу.\nproduct.json: карточка товара; габариты — в миллиметрах, геометрия GLB — в метрах.\nПри загрузке в комнату используйте масштаб [1,1,1].\n')},{level:1});download(archive,safeStem(card().sku)+'.zip','application/zip');notice('Комплект подготовлен: нормализованная модель model.glb и карточка product.json.');}
  catch(error){notice('Не удалось экспортировать модель: '+error.message,true);}finally{saving=false;$('export').textContent='Скачать комплект GLB + JSON';refreshCheck();}
};
try { initViewer(); await refreshCatalog(); await openExample(); }
catch(error){notice('Не удалось запустить 3D-просмотр: '+error.message,true);$('viewer-placeholder').querySelector('span').textContent='3D-просмотр недоступен';$('viewer-placeholder').querySelector('p').textContent='Откройте сайт в браузере с поддержкой WebGL 2.';}
