/*
=========================================================
Nombre completo: local-db.js
Ruta o ubicación: /src/js/local-db.js

Función o funciones:
1. Guardar eventos y pendientes de AgendaJeff de forma local.
2. Leer eventos guardados al abrir nuevamente la app.
3. Mantener persistencia real con IndexedDB.
4. Usar localStorage como respaldo si IndexedDB falla.
5. Guardar configuraciones locales y cola de sincronización.
6. Evitar que la carga masiva se pierda al cerrar la app.
7. Borrar duplicados locales en lote.

Con qué se conecta:
- src/js/sync-service.js
- src/js/app.js
- src/js/bulk-preview.js
- src/js/events.js
- src/js/duplicate-service.js

Para qué sirve:
Sirve como base local persistente de AgendaJeff. Todo evento debe guardarse aquí
antes de enviarse a Firebase, Google, Microsoft, Telegram o notificaciones de PC.
=========================================================
*/

const DB_NAME = "AgendaJeffDB";
const DB_VERSION = 6;

const STORES = {
  ITEMS: "items",
  SETTINGS: "settings",
  SYNC_QUEUE: "syncQueue"
};

const LOCAL_STORAGE_KEYS = {
  ITEMS: "agendaJeff.items",
  SETTINGS: "agendaJeff.settings",
  SYNC_QUEUE: "agendaJeff.syncQueue"
};

let dbPromise = null;

function hasIndexedDB() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function nowISO() {
  return new Date().toISOString();
}

function createId(prefix = "item") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeJSONParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function readLocalStorageArray(key) {
  if (typeof localStorage === "undefined") {
    return [];
  }

  return safeJSONParse(localStorage.getItem(key), []);
}

function writeLocalStorageArray(key, value = []) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function readLocalStorageObject(key) {
  if (typeof localStorage === "undefined") {
    return {};
  }

  return safeJSONParse(localStorage.getItem(key), {});
}

function writeLocalStorageObject(key, value = {}) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(key, JSON.stringify(value && typeof value === "object" ? value : {}));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Error en IndexedDB."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("Error en transacción local."));
    transaction.onabort = () => reject(transaction.error || new Error("Transacción local cancelada."));
  });
}

function ensureIndex(store, indexName, keyPath, options = {}) {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
  }
}

function createOrUpgradeStores(db) {
  if (!db.objectStoreNames.contains(STORES.ITEMS)) {
    db.createObjectStore(STORES.ITEMS, {
      keyPath: "id"
    });
  }

  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    db.createObjectStore(STORES.SETTINGS, {
      keyPath: "key"
    });
  }

  if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
    db.createObjectStore(STORES.SYNC_QUEUE, {
      keyPath: "id"
    });
  }
}

function upgradeIndexes(event) {
  const db = event.target.result;

  createOrUpgradeStores(db);

  const transaction = event.target.transaction;

  if (transaction.objectStoreNames.contains(STORES.ITEMS)) {
    const itemsStore = transaction.objectStore(STORES.ITEMS);

    ensureIndex(itemsStore, "syncStatus", "syncStatus", { unique: false });
    ensureIndex(itemsStore, "updatedAt", "updatedAt", { unique: false });
    ensureIndex(itemsStore, "createdAt", "createdAt", { unique: false });
    ensureIndex(itemsStore, "date", "date", { unique: false });
    ensureIndex(itemsStore, "type", "type", { unique: false });
    ensureIndex(itemsStore, "status", "status", { unique: false });
    ensureIndex(itemsStore, "duplicateKey", "duplicateKey", { unique: false });
  }

  if (transaction.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
    const queueStore = transaction.objectStore(STORES.SYNC_QUEUE);

    ensureIndex(queueStore, "type", "type", { unique: false });
    ensureIndex(queueStore, "itemId", "itemId", { unique: false });
    ensureIndex(queueStore, "createdAt", "createdAt", { unique: false });
  }
}

export async function openLocalDB() {
  if (!hasIndexedDB()) {
    return null;
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = upgradeIndexes;

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("No se pudo abrir la base local."));
    };

    request.onblocked = () => {
      console.warn("IndexedDB está bloqueada por otra ventana de AgendaJeff.");
    };
  });

  return dbPromise;
}

function normalizeLocalItem(item = {}) {
  const createdAt = item.createdAt || nowISO();

  return {
    ...item,
    id: item.id || createId("agenda"),
    type: item.type || "evento",
    status: item.status || "activo",
    syncStatus: item.syncStatus || "pendiente",
    source: item.source || "manual",
    createdAt,
    updatedAt: item.updatedAt || createdAt
  };
}

async function idbPut(storeName, value) {
  const db = await openLocalDB();

  if (!db) {
    throw new Error("IndexedDB no disponible.");
  }

  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  store.put(value);

  await transactionDone(transaction);

  return value;
}

async function idbDelete(storeName, key) {
  const db = await openLocalDB();

  if (!db) {
    throw new Error("IndexedDB no disponible.");
  }

  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  store.delete(key);

  await transactionDone(transaction);

  return true;
}

async function idbGetAll(storeName) {
  const db = await openLocalDB();

  if (!db) {
    throw new Error("IndexedDB no disponible.");
  }

  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const request = store.getAll();

  const result = await requestToPromise(request);

  return Array.isArray(result) ? result : [];
}

async function idbGet(storeName, key) {
  const db = await openLocalDB();

  if (!db) {
    throw new Error("IndexedDB no disponible.");
  }

  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const request = store.get(key);

  return requestToPromise(request);
}

export async function saveLocalItem(item = {}) {
  const record = normalizeLocalItem(item);

  if (!hasIndexedDB()) {
    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
    const index = items.findIndex((current) => current.id === record.id);

    if (index >= 0) {
      items[index] = record;
    } else {
      items.unshift(record);
    }

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return record;
  }

  try {
    await idbPut(STORES.ITEMS, record);
    return record;
  } catch (error) {
    console.warn("IndexedDB falló al guardar. Se usa localStorage.", error);

    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
    const index = items.findIndex((current) => current.id === record.id);

    if (index >= 0) {
      items[index] = record;
    } else {
      items.unshift(record);
    }

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return record;
  }
}

export async function saveManyLocalItems(items = []) {
  const normalizedItems = items.map(normalizeLocalItem);

  if (!normalizedItems.length) {
    return [];
  }

  if (!hasIndexedDB()) {
    const currentItems = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
    const map = new Map();

    currentItems.forEach((item) => {
      if (item?.id) {
        map.set(item.id, item);
      }
    });

    normalizedItems.forEach((item) => {
      map.set(item.id, item);
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, Array.from(map.values()));

    return normalizedItems;
  }

  try {
    const db = await openLocalDB();
    const transaction = db.transaction(STORES.ITEMS, "readwrite");
    const store = transaction.objectStore(STORES.ITEMS);

    normalizedItems.forEach((item) => {
      store.put(item);
    });

    await transactionDone(transaction);

    return normalizedItems;
  } catch (error) {
    console.warn("IndexedDB falló al guardar varios registros. Se usa localStorage.", error);

    const currentItems = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
    const map = new Map();

    currentItems.forEach((item) => {
      if (item?.id) {
        map.set(item.id, item);
      }
    });

    normalizedItems.forEach((item) => {
      map.set(item.id, item);
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, Array.from(map.values()));

    return normalizedItems;
  }
}

export async function getAllLocalItems() {
  if (!hasIndexedDB()) {
    return readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
  }

  try {
    const items = await idbGetAll(STORES.ITEMS);

    return items
      .filter((item) => item && item.id)
      .sort((left, right) => {
        const leftDate = `${left.date || "9999-12-31"} ${left.time || "23:59"}`;
        const rightDate = `${right.date || "9999-12-31"} ${right.time || "23:59"}`;

        return leftDate.localeCompare(rightDate);
      });
  } catch (error) {
    console.warn("IndexedDB falló al leer. Se usa localStorage.", error);

    return readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);
  }
}

export async function getLocalItem(itemId) {
  if (!itemId) {
    return null;
  }

  if (!hasIndexedDB()) {
    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);

    return items.find((item) => item.id === itemId) || null;
  }

  try {
    return await idbGet(STORES.ITEMS, itemId);
  } catch (error) {
    console.warn("IndexedDB falló al buscar item. Se usa localStorage.", error);

    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS);

    return items.find((item) => item.id === itemId) || null;
  }
}

export async function deleteLocalItem(itemId) {
  if (!itemId) {
    return false;
  }

  if (!hasIndexedDB()) {
    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS).filter((item) => {
      return item.id !== itemId;
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return true;
  }

  try {
    await idbDelete(STORES.ITEMS, itemId);
    return true;
  } catch (error) {
    console.warn("IndexedDB falló al eliminar. Se usa localStorage.", error);

    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS).filter((item) => {
      return item.id !== itemId;
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return true;
  }
}

export async function deleteManyLocalItems(itemIds = []) {
  const ids = Array.from(new Set((Array.isArray(itemIds) ? itemIds : []).filter(Boolean)));

  if (!ids.length) {
    return {
      ok: true,
      deleted: 0
    };
  }

  if (!hasIndexedDB()) {
    const idsSet = new Set(ids);
    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS).filter((item) => {
      return !idsSet.has(item.id);
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return {
      ok: true,
      deleted: ids.length
    };
  }

  try {
    const db = await openLocalDB();
    const transaction = db.transaction(STORES.ITEMS, "readwrite");
    const store = transaction.objectStore(STORES.ITEMS);

    ids.forEach((itemId) => {
      store.delete(itemId);
    });

    await transactionDone(transaction);

    return {
      ok: true,
      deleted: ids.length
    };
  } catch (error) {
    console.warn("IndexedDB falló al eliminar varios registros. Se usa localStorage.", error);

    const idsSet = new Set(ids);
    const items = readLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS).filter((item) => {
      return !idsSet.has(item.id);
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, items);

    return {
      ok: true,
      deleted: ids.length
    };
  }
}

export async function replaceAllLocalItems(items = []) {
  const normalizedItems = items.map(normalizeLocalItem);

  if (!hasIndexedDB()) {
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, normalizedItems);

    return normalizedItems;
  }

  try {
    const db = await openLocalDB();
    const transaction = db.transaction(STORES.ITEMS, "readwrite");
    const store = transaction.objectStore(STORES.ITEMS);

    store.clear();

    normalizedItems.forEach((item) => {
      store.put(item);
    });

    await transactionDone(transaction);

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, normalizedItems);

    return normalizedItems;
  } catch (error) {
    console.warn("IndexedDB falló al reemplazar registros. Se usa localStorage.", error);
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, normalizedItems);

    return normalizedItems;
  }
}

export async function getPendingSyncItems() {
  const items = await getAllLocalItems();

  return items.filter((item) => {
    const status = String(item.syncStatus || "").toLowerCase();

    return status === "pendiente" || status === "pending" || status === "error";
  });
}

export async function clearLocalItems() {
  if (!hasIndexedDB()) {
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, []);
    return true;
  }

  try {
    const db = await openLocalDB();
    const transaction = db.transaction(STORES.ITEMS, "readwrite");
    const store = transaction.objectStore(STORES.ITEMS);

    store.clear();

    await transactionDone(transaction);

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, []);

    return true;
  } catch (error) {
    console.warn("IndexedDB falló al limpiar. Se limpia localStorage.", error);
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.ITEMS, []);

    return true;
  }
}

export async function saveSetting(key, value) {
  if (!key) {
    throw new Error("No se puede guardar una configuración sin clave.");
  }

  const record = {
    key,
    value,
    updatedAt: nowISO()
  };

  if (!hasIndexedDB()) {
    const settings = readLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS);

    settings[key] = record;
    writeLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS, settings);

    return record;
  }

  try {
    await idbPut(STORES.SETTINGS, record);
    return record;
  } catch (error) {
    console.warn("IndexedDB falló al guardar configuración. Se usa localStorage.", error);

    const settings = readLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS);

    settings[key] = record;
    writeLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS, settings);

    return record;
  }
}

export async function getSetting(key, fallback = null) {
  if (!key) {
    return fallback;
  }

  if (!hasIndexedDB()) {
    const settings = readLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS);

    return settings[key]?.value ?? fallback;
  }

  try {
    const record = await idbGet(STORES.SETTINGS, key);

    return record?.value ?? fallback;
  } catch (error) {
    console.warn("IndexedDB falló al leer configuración. Se usa localStorage.", error);

    const settings = readLocalStorageObject(LOCAL_STORAGE_KEYS.SETTINGS);

    return settings[key]?.value ?? fallback;
  }
}

export async function enqueueSyncJob(job = {}) {
  const record = {
    id: job.id || createId("sync"),
    type: job.type || "upsert",
    itemId: job.itemId || null,
    payload: job.payload || null,
    createdAt: job.createdAt || nowISO()
  };

  if (!hasIndexedDB()) {
    const queue = readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE);

    queue.push(record);
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);

    return record;
  }

  try {
    await idbPut(STORES.SYNC_QUEUE, record);
    return record;
  } catch (error) {
    console.warn("IndexedDB falló al encolar sync. Se usa localStorage.", error);

    const queue = readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE);

    queue.push(record);
    writeLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);

    return record;
  }
}

export async function getSyncQueue() {
  if (!hasIndexedDB()) {
    return readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE);
  }

  try {
    return await idbGetAll(STORES.SYNC_QUEUE);
  } catch (error) {
    console.warn("IndexedDB falló al leer cola. Se usa localStorage.", error);

    return readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE);
  }
}

export async function deleteSyncJob(jobId) {
  if (!jobId) {
    return false;
  }

  if (!hasIndexedDB()) {
    const queue = readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE).filter((job) => {
      return job.id !== jobId;
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);

    return true;
  }

  try {
    await idbDelete(STORES.SYNC_QUEUE, jobId);
    return true;
  } catch (error) {
    console.warn("IndexedDB falló al eliminar job. Se usa localStorage.", error);

    const queue = readLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE).filter((job) => {
      return job.id !== jobId;
    });

    writeLocalStorageArray(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);

    return true;
  }
}