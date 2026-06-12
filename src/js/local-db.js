/*
=========================================================
Nombre completo: local-db.js
Ruta o ubicación: /src/js/local-db.js

Función o funciones:
1. Guardar eventos y pendientes localmente.
2. Permitir que la app funcione sin internet.
3. Guardar cola de sincronización.
4. Guardar configuraciones locales.
5. Recuperar datos al abrir la app.

Con qué se conecta:
- src/js/events.js
- src/js/sync-service.js
- src/js/settings.js
- src/js/firebase-service.js

Para qué sirve:
Sirve como base local de AgendaJeff usando IndexedDB.
=========================================================
*/

const DB_NAME = "AgendaJeffDB";
const DB_VERSION = 1;

const STORES = {
  ITEMS: "items",
  SETTINGS: "settings",
  SYNC_QUEUE: "syncQueue"
};

let dbInstance = null;

export function openLocalDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.ITEMS)) {
        const itemsStore = db.createObjectStore(STORES.ITEMS, {
          keyPath: "id"
        });

        itemsStore.createIndex("status", "status", { unique: false });
        itemsStore.createIndex("date", "date", { unique: false });
        itemsStore.createIndex("syncStatus", "syncStatus", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, {
          keyPath: "key"
        });
      }

      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, {
          keyPath: "id"
        });

        queueStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function withStore(storeName, mode, callback) {
  const db = await openLocalDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);

    transaction.oncomplete = () => {
      resolve(result);
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.onabort = () => {
      reject(transaction.error);
    };
  });
}

export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveLocalItem(item) {
  await withStore(STORES.ITEMS, "readwrite", (store) => {
    store.put(item);
  });

  return item;
}

export async function saveManyLocalItems(items = []) {
  await withStore(STORES.ITEMS, "readwrite", (store) => {
    items.forEach((item) => {
      store.put(item);
    });
  });

  return items;
}

export async function getLocalItem(itemId) {
  let request;

  await withStore(STORES.ITEMS, "readonly", (store) => {
    request = store.get(itemId);
  });

  return requestToPromise(request);
}

export async function getAllLocalItems() {
  let request;

  await withStore(STORES.ITEMS, "readonly", (store) => {
    request = store.getAll();
  });

  return requestToPromise(request);
}

export async function deleteLocalItem(itemId) {
  await withStore(STORES.ITEMS, "readwrite", (store) => {
    store.delete(itemId);
  });

  return true;
}

export async function clearLocalItems() {
  await withStore(STORES.ITEMS, "readwrite", (store) => {
    store.clear();
  });

  return true;
}

export async function getPendingSyncItems() {
  const allItems = await getAllLocalItems();

  return allItems.filter((item) => {
    return item.syncStatus === "pendiente" || item.syncStatus === "error";
  });
}

export async function saveSetting(key, value) {
  const record = {
    key,
    value,
    updatedAt: new Date().toISOString()
  };

  await withStore(STORES.SETTINGS, "readwrite", (store) => {
    store.put(record);
  });

  return record;
}

export async function getSetting(key, fallback = null) {
  let request;

  await withStore(STORES.SETTINGS, "readonly", (store) => {
    request = store.get(key);
  });

  const result = await requestToPromise(request);

  return result?.value ?? fallback;
}

export async function enqueueSyncJob(job = {}) {
  const record = {
    id: job.id || `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: job.type || "upsert",
    itemId: job.itemId || null,
    payload: job.payload || null,
    createdAt: new Date().toISOString()
  };

  await withStore(STORES.SYNC_QUEUE, "readwrite", (store) => {
    store.put(record);
  });

  return record;
}

export async function getSyncQueue() {
  let request;

  await withStore(STORES.SYNC_QUEUE, "readonly", (store) => {
    request = store.getAll();
  });

  return requestToPromise(request);
}

export async function deleteSyncJob(jobId) {
  await withStore(STORES.SYNC_QUEUE, "readwrite", (store) => {
    store.delete(jobId);
  });

  return true;
}