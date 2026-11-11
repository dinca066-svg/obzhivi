export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const AXES = ['width', 'depth', 'height'];
export const TOLERANCE = { absoluteMm: 5, relative: 0.01 };

export function inspectGlb(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw new Error('Файл слишком короткий для GLB.');
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('GLB больше 50 МБ. Оптимизируйте модель и текстуры.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) throw new Error('Нужен файл GLB версии 2.0.');
  if (view.getUint32(8, true) !== buffer.byteLength) throw new Error('GLB повреждён: размер файла не совпадает с заголовком.');
  let offset = 12, json = null, chunks = 0;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('Повреждён заголовок секции GLB.');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('Повреждена секция GLB.');
    if (!chunks && type !== 0x4e4f534a) throw new Error('GLB должен начинаться с JSON-секции.');
    if (type === 0x4e4f534a) {
      if (json || length > 8 * 1024 * 1024) throw new Error('Некорректная JSON-секция GLB.');
      try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length))); }
      catch { throw new Error('Не удалось прочитать описание GLB.'); }
    }
    offset += length + 8; chunks++;
  }
  if (!json || json.asset?.version !== '2.0') throw new Error('Не найдено описание glTF 2.0.');
  for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) throw new Error('В GLB есть внешние файлы. Экспортируйте модель со встроенными текстурами.');
  }
  if (json.animations?.length || json.skins?.length || json.meshes?.some(m => m.primitives?.some(p => p.targets?.length))) {
    throw new Error('Первая версия принимает статичную мебель. Экспортируйте GLB без анимации, скелета и morph targets.');
  }
  if (!json.meshes?.length) throw new Error('В файле нет геометрии мебели.');
  if ((json.nodes?.length || 0) > 10000) throw new Error('Слишком много объектов. Объедините и оптимизируйте модель.');
  const nodes = json.nodes || [], visiting = new Set(), visited = new Set();
  function visit(id, depth = 0) {
    if (!Number.isInteger(id) || !nodes[id]) throw new Error('Некорректная ссылка на объект GLB.');
    if (depth > 100 || visiting.has(id)) throw new Error('Некорректная вложенность объектов GLB.');
    if (visited.has(id)) return;
    visiting.add(id); for (const child of nodes[id].children || []) visit(child, depth + 1);
    visiting.delete(id); visited.add(id);
  }
  nodes.forEach((_, id) => visit(id));
  if ((json.scenes?.length || 0) > 1) throw new Error('Экспортируйте один товар в одной сцене GLB.');
  return json;
}

export function validDimensions(value) {
  return AXES.every(axis => Number.isFinite(value[axis]) && value[axis] >= 1 && value[axis] <= 50000);
}
export function compareDimensions(actual, declared) {
  if (!validDimensions(declared) || !AXES.every(axis => Number.isFinite(actual[axis]) && actual[axis] > 0)) {
    return { status: 'incomplete', rows: [], factor: null };
  }
  const rows = AXES.map(axis => ({ axis, actual: actual[axis], declared: declared[axis],
    difference: actual[axis] - declared[axis], tolerance: Math.max(TOLERANCE.absoluteMm, declared[axis] * TOLERANCE.relative) }));
  if (rows.every(row => Math.abs(row.difference) <= row.tolerance)) return { status: 'match', rows, factor: 1 };
  // Intersect the acceptable factor intervals for all axes. No per-axis stretching.
  const lower = Math.max(...rows.map(r => (r.declared - r.tolerance) / r.actual));
  const upper = Math.min(...rows.map(r => (r.declared + r.tolerance) / r.actual));
  const ideal = Math.exp(AXES.reduce((sum, axis) => sum + Math.log(declared[axis] / actual[axis]), 0) / 3);
  const factor = Math.max(lower, Math.min(upper, ideal));
  if (lower <= upper && Number.isFinite(factor) && factor > 0 && factor >= 1e-6 && factor <= 1e6) {
    return { status: 'uniform_scale', rows, factor };
  }
  return { status: 'proportion_mismatch', rows, factor: null };
}
export function itemKey(manufacturer, sku) {
  return [manufacturer, sku].map(s => s.normalize('NFKC').trim().toLocaleLowerCase('ru-RU')).join('\u001f');
}
export function safeStem(sku) { return sku.normalize('NFKC').replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 80) || 'furniture'; }
export function validateCard(card) {
  if (![card.name, card.manufacturer, card.sku].every(s => typeof s === 'string' && s.trim())) return 'Заполните название, производителя и артикул комплектации.';
  if ([card.name, card.manufacturer, card.sku, card.finish].some(s => (s?.length || 0) > 160)) return 'Поле не должно быть длиннее 160 символов.';
  if (!validDimensions(card.dimensionsMm)) return 'Укажите все внешние габариты от 1 до 50 000 мм.';
  return null;
}
