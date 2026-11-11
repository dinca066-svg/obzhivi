let promise;
function database() {
  if (!promise) promise = new Promise((resolve, reject) => {
    const request = indexedDB.open('obzhivi-furniture-catalog', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('products', { keyPath: 'id' });
      store.createIndex('uniqueSku', 'uniqueKey', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закройте другие вкладки каталога и повторите попытку.'));
  });
  return promise;
}
export async function listProducts() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const request = tx.objectStore('products').getAll();
    request.onsuccess = () => resolve(request.result.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error);
  });
}
export async function saveProduct(product) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    tx.objectStore('products').put(product);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Сохранение отменено.'));
  });
}
