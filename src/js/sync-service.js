/*
=========================================================
Nombre completo: sync-service.js
Ruta o ubicación: /src/js/sync-service.js

Función o funciones:
1. Sincronizar automáticamente local con Firebase.
2. Detectar cuando vuelve internet.
3. Subir registros pendientes.
4. Descargar registros existentes desde Firebase.
5. Mantener la app funcional sin internet.
6. Guardar ediciones reemplazando por id para evitar duplicados.

Con qué se conecta:
- src/js/local-db.js
- src/js/firebase-service.js
- src/js/state.js
- src/js/events.js
- src/js/ui.js

Para qué sirve:
Sirve para que AgendaJeff guarde primero local y luego sincronice sola.
=========================================================
*/

import {
  getAllLocalItems,
  getPendingSyncItems,
  saveLocalItem,
  saveManyLocalItems,
  deleteLocalItem
} from "./local-db.js";

import {
  upsertFirebaseItem,
  deleteFirebaseItem,
  getFirebaseItems
} from "./firebase-service.js";

import {
  agendaState,
  setNetworkStatus,
  setLastSyncNow
} from "./state.js";

import {
  SYNC_STATUS,
  normalizeAgendaItems,
  shouldDeleteAutomatically
} from "./events.js";

let syncTimer = null;
let isSyncing = false;

export function isOnline() {
  return navigator.onLine;
}

export function updatePendingCounter(items = agendaState.items) {
  agendaState.sync.pendingCount = items.filter((item) => {
    return item.syncStatus === SYNC_STATUS.PENDIENTE || item.syncStatus === SYNC_STATUS.ERROR;
  }).length;
}

export function replaceItemInState(item = {}) {
  if (!item?.id) {
    return;
  }

  const existingIndex = agendaState.items.findIndex((record) => {
    return record.id === item.id;
  });

  if (existingIndex >= 0) {
    agendaState.items[existingIndex] = item;
  } else {
    agendaState.items.unshift(item);
  }
}

export function replaceManyItemsInState(items = []) {
  const byId = new Map();

  agendaState.items.forEach((item) => {
    if (item?.id) {
      byId.set(item.id, item);
    }
  });

  items.forEach((item) => {
    if (item?.id) {
      byId.set(item.id, item);
    }
  });

  agendaState.items = Array.from(byId.values());
}

export async function loadLocalItemsIntoState() {
  const localItems = await getAllLocalItems();
  const normalized = normalizeAgendaItems(localItems);

  agendaState.items = normalized;
  updatePendingCounter(agendaState.items);

  return agendaState.items;
}

export async function saveItemLocalFirst(item) {
  const localItem = {
    ...item,
    syncStatus: SYNC_STATUS.PENDIENTE,
    updatedAt: new Date().toISOString()
  };

  await saveLocalItem(localItem);

  replaceItemInState(localItem);
  updatePendingCounter(agendaState.items);

  if (isOnline()) {
    syncNow().catch(() => {});
  }

  return localItem;
}

export async function saveManyItemsLocalFirst(items = []) {
  const now = new Date().toISOString();
  const prepared = items.map((item) => {
    return {
      ...item,
      syncStatus: SYNC_STATUS.PENDIENTE,
      updatedAt: now
    };
  });

  await saveManyLocalItems(prepared);

  replaceManyItemsInState(prepared);
  updatePendingCounter(agendaState.items);

  if (isOnline()) {
    syncNow().catch(() => {});
  }

  return prepared;
}

export async function uploadPendingItems() {
  const pendingItems = await getPendingSyncItems();
  const uploaded = [];
  const failed = [];

  for (const item of pendingItems) {
    try {
      if (shouldDeleteAutomatically(item)) {
        await deleteFirebaseItem(item.id).catch(() => {});
        await deleteLocalItem(item.id);
        uploaded.push(item.id);
        continue;
      }

      const synced = await upsertFirebaseItem({
        ...item,
        syncStatus: SYNC_STATUS.SINCRONIZADO
      });

      const localSynced = {
        ...item,
        ...synced,
        syncStatus: SYNC_STATUS.SINCRONIZADO,
        updatedAt: new Date().toISOString()
      };

      await saveLocalItem(localSynced);
      replaceItemInState(localSynced);
      uploaded.push(localSynced.id);
    } catch (error) {
      const failedItem = {
        ...item,
        syncStatus: SYNC_STATUS.ERROR,
        syncError: error.message || "Error al sincronizar.",
        updatedAt: new Date().toISOString()
      };

      await saveLocalItem(failedItem);
      replaceItemInState(failedItem);
      failed.push(failedItem);
    }
  }

  updatePendingCounter(agendaState.items);

  return {
    uploaded,
    failed
  };
}

export function mergeItems(localItems = [], remoteItems = []) {
  const map = new Map();

  [...remoteItems, ...localItems].forEach((item) => {
    if (!item?.id) {
      return;
    }

    const existing = map.get(item.id);

    if (!existing) {
      map.set(item.id, item);
      return;
    }

    const existingDate = new Date(existing.updatedAt || existing.createdAt || 0);
    const itemDate = new Date(item.updatedAt || item.createdAt || 0);

    if (itemDate >= existingDate) {
      map.set(item.id, item);
    }
  });

  return normalizeAgendaItems(Array.from(map.values()));
}

export async function downloadAndMergeFirebaseItems() {
  const localItems = await getAllLocalItems();
  const remoteItems = await getFirebaseItems();

  const merged = mergeItems(localItems, remoteItems);

  await saveManyLocalItems(merged);

  agendaState.items = merged;
  updatePendingCounter(agendaState.items);

  return merged;
}

export async function syncNow() {
  if (isSyncing) {
    return {
      ok: false,
      message: "Sincronización ya en curso."
    };
  }

  if (!isOnline()) {
    setNetworkStatus(false);

    return {
      ok: false,
      message: "Sin internet. Los datos quedan guardados localmente."
    };
  }

  isSyncing = true;
  setNetworkStatus(true);

  try {
    await uploadPendingItems();
    await downloadAndMergeFirebaseItems();
    setLastSyncNow();
    updatePendingCounter(agendaState.items);

    window.dispatchEvent(new CustomEvent("agendaJeff:synced", {
      detail: {
        items: agendaState.items
      }
    }));

    return {
      ok: true,
      message: "Sincronización completada.",
      items: agendaState.items
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "No se pudo sincronizar."
    };
  } finally {
    isSyncing = false;
  }
}

export function startAutoSync(options = {}) {
  const intervalMs = options.intervalMs || 30000;

  stopAutoSync();

  syncTimer = window.setInterval(() => {
    if (isOnline()) {
      syncNow().catch(() => {});
    }
  }, intervalMs);

  window.addEventListener("online", () => {
    setNetworkStatus(true);
    syncNow().catch(() => {});
  });

  window.addEventListener("offline", () => {
    setNetworkStatus(false);
    window.dispatchEvent(new CustomEvent("agendaJeff:offline"));
  });
}

export function stopAutoSync() {
  if (syncTimer) {
    window.clearInterval(syncTimer);
    syncTimer = null;
  }
}

export async function initSyncService() {
  setNetworkStatus(isOnline());
  await loadLocalItemsIntoState();

  if (isOnline()) {
    await syncNow().catch(() => {});
  }

  startAutoSync();

  return {
    ok: true,
    online: isOnline(),
    items: agendaState.items
  };
}