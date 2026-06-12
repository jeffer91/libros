/*
=========================================================
Nombre completo: sync-service.js
Ruta o ubicación: /src/js/sync-service.js

Función o funciones:
1. Cargar primero los eventos locales al iniciar la app.
2. Guardar eventos manuales y masivos primero en local.
3. Sincronizar automáticamente con Firebase cuando haya internet.
4. Evitar que Firebase vacío borre los eventos locales.
5. Subir registros pendientes.
6. Descargar registros de Firebase y fusionarlos sin duplicar.
7. Mantener AgendaJeff funcional aunque no haya internet.
8. Limpiar duplicados en local y Firebase.

Con qué se conecta:
- src/js/local-db.js
- src/js/firebase-service.js
- src/js/state.js
- src/js/events.js
- src/js/app.js
- src/js/ui.js
- src/js/duplicate-service.js

Para qué sirve:
Sirve para que AgendaJeff funcione local-first: primero guarda en la computadora,
después sincroniza con Firebase y plataformas sin duplicar eventos.
=========================================================
*/

import {
  deleteLocalItem,
  deleteManyLocalItems,
  getAllLocalItems,
  getPendingSyncItems,
  replaceAllLocalItems,
  saveLocalItem,
  saveManyLocalItems
} from "./local-db.js";

import {
  deleteFirebaseItem,
  deleteManyFirebaseItems,
  getFirebaseItems,
  upsertFirebaseItem
} from "./firebase-service.js";

import {
  agendaState,
  setLastSyncNow,
  setNetworkStatus
} from "./state.js";

import {
  normalizeAgendaItems,
  shouldDeleteAutomatically,
  SYNC_STATUS
} from "./events.js";

import {
  dedupeItems,
  filterIncomingDuplicates,
  getDuplicateKey,
  mergeCollectionsWithoutDuplicates,
  withDuplicateKey
} from "./duplicate-service.js";

const STATUS = {
  PENDIENTE: SYNC_STATUS?.PENDIENTE || "pendiente",
  SINCRONIZADO: SYNC_STATUS?.SINCRONIZADO || "sincronizado",
  ERROR: SYNC_STATUS?.ERROR || "error"
};

let syncTimer = null;
let isSyncing = false;
let onlineListenerReady = false;

function nowISO() {
  return new Date().toISOString();
}

function createId(prefix = "item") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isOnline() {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

function getTimeValue(value) {
  const time = new Date(value || 0).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isRemoteNewer(remoteItem = {}, localItem = {}) {
  const remoteUpdated = getTimeValue(remoteItem.updatedAt || remoteItem.createdAt);
  const localUpdated = getTimeValue(localItem.updatedAt || localItem.createdAt);

  return remoteUpdated > localUpdated;
}

function isPending(item = {}) {
  const status = String(item.syncStatus || "").toLowerCase();

  return status === STATUS.PENDIENTE || status === "pending" || status === STATUS.ERROR;
}

function sortAgendaItems(items = []) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.date || "9999-12-31"} ${left.time || "23:59"} ${left.updatedAt || ""}`;
    const rightKey = `${right.date || "9999-12-31"} ${right.time || "23:59"} ${right.updatedAt || ""}`;

    return leftKey.localeCompare(rightKey);
  });
}

function normalizeForLocalFirst(item = {}) {
  const createdAt = item.createdAt || nowISO();

  return withDuplicateKey({
    ...item,
    id: item.id || createId("agenda"),
    type: item.type || "evento",
    status: item.status || "activo",
    source: item.source || "manual",
    createdAt,
    updatedAt: nowISO(),
    syncStatus: STATUS.PENDIENTE
  });
}

function markAsSynced(item = {}, extra = {}) {
  return withDuplicateKey({
    ...item,
    ...extra,
    syncStatus: STATUS.SINCRONIZADO,
    syncedAt: nowISO(),
    updatedAt: extra.updatedAt || item.updatedAt || nowISO()
  });
}

function markAsSyncError(item = {}, error) {
  return withDuplicateKey({
    ...item,
    syncStatus: STATUS.ERROR,
    syncError: error?.message || "No se pudo sincronizar.",
    updatedAt: item.updatedAt || nowISO()
  });
}

export function updatePendingCounter(items = agendaState.items || []) {
  if (!agendaState.sync) {
    agendaState.sync = {};
  }

  agendaState.sync.pendingCount = items.filter(isPending).length;

  return agendaState.sync.pendingCount;
}

export function replaceStateItems(items = []) {
  agendaState.items = sortAgendaItems(Array.isArray(items) ? items : []);
  updatePendingCounter(agendaState.items);

  return agendaState.items;
}

export function upsertItemsInState(items = []) {
  const map = new Map();

  (agendaState.items || []).forEach((item) => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });

  items.forEach((item) => {
    if (item?.id) {
      map.set(item.id, item);
    }
  });

  const deduped = dedupeItems(Array.from(map.values()));

  agendaState.items = sortAgendaItems(deduped.uniqueItems);
  updatePendingCounter(agendaState.items);

  return agendaState.items;
}

export async function cleanLocalDuplicates() {
  const localItems = await getAllLocalItems();
  const normalizedItems = normalizeAgendaItems(localItems).map(withDuplicateKey);
  const deduped = dedupeItems(normalizedItems);

  if (deduped.idsToDelete.length) {
    await deleteManyLocalItems(deduped.idsToDelete);
    await saveManyLocalItems(deduped.uniqueItems);
  } else {
    await saveManyLocalItems(deduped.uniqueItems);
  }

  replaceStateItems(deduped.uniqueItems);

  return deduped;
}

export async function cleanFirebaseDuplicates() {
  if (!isOnline()) {
    return {
      uniqueItems: [],
      duplicateItems: [],
      idsToDelete: [],
      stats: {
        total: 0,
        unique: 0,
        duplicates: 0,
        deleted: 0
      }
    };
  }

  const remoteItems = await getFirebaseItems();
  const normalizedRemote = normalizeAgendaItems(remoteItems).map(withDuplicateKey);
  const deduped = dedupeItems(normalizedRemote);

  if (deduped.idsToDelete.length) {
    await deleteManyFirebaseItems(deduped.idsToDelete);
  }

  for (const item of deduped.uniqueItems) {
    await upsertFirebaseItem(item).catch(() => {});
  }

  return deduped;
}

export async function cleanAllDuplicates() {
  const local = await cleanLocalDuplicates();
  let firebase = null;

  if (isOnline()) {
    firebase = await cleanFirebaseDuplicates().catch((error) => {
      console.warn("No se pudieron limpiar duplicados en Firebase.", error);

      return null;
    });
  }

  return {
    local,
    firebase
  };
}

export async function loadLocalItemsIntoState() {
  const cleanResult = await cleanLocalDuplicates();

  return cleanResult.uniqueItems;
}

export async function saveItemLocalFirst(item = {}) {
  const existingItems = await getAllLocalItems();
  const localItem = normalizeForLocalFirst(item);
  const duplicateKey = getDuplicateKey(localItem);

  const duplicate = existingItems.find((current) => {
    return current.id !== localItem.id && getDuplicateKey(current) === duplicateKey;
  });

  if (duplicate) {
    const duplicateResult = withDuplicateKey({
      ...duplicate,
      duplicateSkipped: true,
      duplicateReason: "Ya existe un evento con el mismo tipo, título, fecha y hora."
    });

    upsertItemsInState([duplicateResult]);

    return duplicateResult;
  }

  const savedItem = await saveLocalItem(localItem);

  upsertItemsInState([savedItem]);

  window.dispatchEvent(new CustomEvent("agendaJeff:local-saved", {
    detail: {
      item: savedItem,
      items: agendaState.items
    }
  }));

  syncNow().catch(() => {});

  return savedItem;
}

export async function saveManyItemsLocalFirst(items = []) {
  const incomingItems = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => normalizeForLocalFirst({
      ...item,
      source: item.source || "bulk"
    }));

  if (!incomingItems.length) {
    return [];
  }

  const localItems = await getAllLocalItems();
  const stateItems = agendaState.items || [];
  const existingItems = [...localItems, ...stateItems];

  const filtered = filterIncomingDuplicates(incomingItems, existingItems);

  if (!filtered.uniqueItems.length) {
    window.dispatchEvent(new CustomEvent("agendaJeff:duplicates-skipped", {
      detail: {
        duplicates: filtered.duplicateItems,
        stats: filtered.stats
      }
    }));

    return [];
  }

  const savedItems = await saveManyLocalItems(filtered.uniqueItems);

  upsertItemsInState(savedItems);

  window.dispatchEvent(new CustomEvent("agendaJeff:local-saved-many", {
    detail: {
      items: savedItems,
      allItems: agendaState.items,
      duplicatesSkipped: filtered.duplicateItems,
      duplicateStats: filtered.stats
    }
  }));

  if (filtered.duplicateItems.length) {
    window.dispatchEvent(new CustomEvent("agendaJeff:duplicates-skipped", {
      detail: {
        duplicates: filtered.duplicateItems,
        stats: filtered.stats
      }
    }));
  }

  syncNow().catch(() => {});

  return savedItems;
}

export async function uploadPendingItems() {
  await cleanLocalDuplicates();

  const pendingItems = await getPendingSyncItems();
  const dedupedPending = dedupeItems(pendingItems.map(withDuplicateKey));
  const uploadedItems = [];
  const failedItems = [];

  if (dedupedPending.idsToDelete.length) {
    await deleteManyLocalItems(dedupedPending.idsToDelete);
  }

  if (!dedupedPending.uniqueItems.length) {
    return {
      uploadedItems,
      failedItems
    };
  }

  for (const item of dedupedPending.uniqueItems) {
    try {
      if (shouldDeleteAutomatically(item)) {
        await deleteFirebaseItem(item.id).catch(() => {});
        await deleteLocalItem(item.id);

        continue;
      }

      if (item.deleted === true || item.status === "eliminado") {
        await deleteFirebaseItem(item.id).catch(() => {});
        await deleteLocalItem(item.id);

        continue;
      }

      const firebaseItem = await upsertFirebaseItem(item);
      const syncedItem = markAsSynced(item, firebaseItem || {});

      await saveLocalItem(syncedItem);
      uploadedItems.push(syncedItem);
    } catch (error) {
      console.warn("No se pudo subir item a Firebase:", item?.id, error);

      const failedItem = markAsSyncError(item, error);

      await saveLocalItem(failedItem);
      failedItems.push(failedItem);
    }
  }

  if (uploadedItems.length || failedItems.length) {
    upsertItemsInState([...uploadedItems, ...failedItems]);
  }

  return {
    uploadedItems,
    failedItems
  };
}

export async function downloadAndMergeFirebaseItems() {
  const remoteItems = await getFirebaseItems();

  if (!Array.isArray(remoteItems) || remoteItems.length === 0) {
    const cleanResult = await cleanLocalDuplicates();

    return cleanResult.uniqueItems;
  }

  const localItems = await getAllLocalItems();

  const localMap = new Map();

  localItems.forEach((item) => {
    if (item?.id) {
      localMap.set(item.id, item);
    }
  });

  const mergedById = new Map();

  localItems.forEach((localItem) => {
    if (localItem?.id) {
      mergedById.set(localItem.id, withDuplicateKey(localItem));
    }
  });

  remoteItems.forEach((remoteItem) => {
    if (!remoteItem?.id) {
      return;
    }

    const localItem = localMap.get(remoteItem.id);

    if (!localItem) {
      mergedById.set(remoteItem.id, markAsSynced(remoteItem));
      return;
    }

    if (isPending(localItem)) {
      mergedById.set(localItem.id, withDuplicateKey(localItem));
      return;
    }

    if (isRemoteNewer(remoteItem, localItem)) {
      mergedById.set(remoteItem.id, markAsSynced(remoteItem));
    } else {
      mergedById.set(localItem.id, withDuplicateKey(localItem));
    }
  });

  const mergedItems = normalizeAgendaItems(Array.from(mergedById.values())).map(withDuplicateKey);
  const deduped = mergeCollectionsWithoutDuplicates([mergedItems]);

  const remoteIdSet = new Set(remoteItems.map((item) => item.id).filter(Boolean));
  const firebaseDuplicateIds = deduped.idsToDelete.filter((itemId) => remoteIdSet.has(itemId));
  const localDuplicateIds = deduped.idsToDelete.filter((itemId) => !remoteIdSet.has(itemId) || localMap.has(itemId));

  if (localDuplicateIds.length) {
    await deleteManyLocalItems(localDuplicateIds);
  }

  if (firebaseDuplicateIds.length) {
    await deleteManyFirebaseItems(firebaseDuplicateIds).catch((error) => {
      console.warn("No se pudieron borrar algunos duplicados de Firebase.", error);
    });
  }

  await replaceAllLocalItems(deduped.uniqueItems);
  replaceStateItems(deduped.uniqueItems);

  for (const item of deduped.uniqueItems) {
    if (isOnline()) {
      await upsertFirebaseItem(item).catch(() => {});
    }
  }

  return agendaState.items;
}

export async function cleanExpiredItems() {
  const items = await getAllLocalItems();
  const expiredItems = items.filter((item) => shouldDeleteAutomatically(item));

  for (const item of expiredItems) {
    await deleteLocalItem(item.id);

    if (isOnline()) {
      await deleteFirebaseItem(item.id).catch(() => {});
    }
  }

  if (expiredItems.length) {
    const freshItems = await getAllLocalItems();
    const deduped = dedupeItems(normalizeAgendaItems(freshItems).map(withDuplicateKey));

    replaceStateItems(deduped.uniqueItems);
  }

  return expiredItems;
}

export async function syncNow() {
  if (isSyncing) {
    return {
      ok: false,
      busy: true,
      message: "La sincronización ya está en proceso."
    };
  }

  if (!isOnline()) {
    setNetworkStatus(false);

    await cleanLocalDuplicates().catch(() => {});

    window.dispatchEvent(new CustomEvent("agendaJeff:offline", {
      detail: {
        items: agendaState.items || []
      }
    }));

    return {
      ok: false,
      offline: true,
      message: "Sin internet. Los datos quedaron guardados localmente."
    };
  }

  isSyncing = true;
  setNetworkStatus(true);

  try {
    await cleanExpiredItems();
    await cleanLocalDuplicates();
    await uploadPendingItems();
    await downloadAndMergeFirebaseItems();
    await cleanFirebaseDuplicates();

    setLastSyncNow();
    updatePendingCounter(agendaState.items);

    window.dispatchEvent(new CustomEvent("agendaJeff:synced", {
      detail: {
        items: agendaState.items
      }
    }));

    return {
      ok: true,
      message: "Sincronización completada sin duplicados.",
      items: agendaState.items
    };
  } catch (error) {
    console.error("Error de sincronización:", error);

    return {
      ok: false,
      message: error.message || "No se pudo sincronizar."
    };
  } finally {
    isSyncing = false;
  }
}

export function stopAutoSync() {
  if (syncTimer) {
    window.clearInterval(syncTimer);
    syncTimer = null;
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

  if (!onlineListenerReady) {
    window.addEventListener("online", () => {
      setNetworkStatus(true);
      syncNow().catch(() => {});
    });

    window.addEventListener("offline", () => {
      setNetworkStatus(false);

      cleanLocalDuplicates().catch(() => {});

      window.dispatchEvent(new CustomEvent("agendaJeff:offline", {
        detail: {
          items: agendaState.items || []
        }
      }));
    });

    onlineListenerReady = true;
  }
}

export async function initSyncService() {
  setNetworkStatus(isOnline());

  await loadLocalItemsIntoState();

  if (isOnline()) {
    await syncNow().catch((error) => {
      console.warn("No se pudo sincronizar al iniciar. Se mantienen datos locales.", error);
    });
  }

  startAutoSync();

  return {
    ok: true,
    online: isOnline(),
    items: agendaState.items
  };
}