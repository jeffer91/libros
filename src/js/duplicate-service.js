/*
=========================================================
Nombre completo: duplicate-service.js
Ruta o ubicación: /src/js/duplicate-service.js

Función o funciones:
1. Detectar eventos y pendientes duplicados.
2. Crear una clave única inteligente por tipo, título, fecha y hora.
3. Evitar que la carga masiva guarde registros repetidos.
4. Limpiar duplicados existentes en local y Firebase.
5. Conservar el registro más completo, más actualizado o ya sincronizado.
6. Proteger los identificadores externos de Google, Microsoft o Telegram si existen.

Con qué se conecta:
- src/js/app.js
- src/js/sync-service.js
- src/js/local-db.js
- src/js/firebase-service.js
- src/js/events.js

Para qué sirve:
Sirve para que AgendaJeff no guarde eventos repetidos aunque se suba varias veces
la misma carga masiva. La comparación no depende del id, sino de los datos reales
del evento.
=========================================================
*/

export const DUPLICATE_KEY_VERSION = "v1";

const EMPTY_TIME_KEY = "sin-hora";
const EMPTY_DATE_KEY = "sin-fecha";
const EMPTY_TITLE_KEY = "sin-titulo";
const DEFAULT_TYPE_KEY = "evento";

function safeString(value) {
  return String(value ?? "").trim();
}

function removeAccents(value) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeTextForDuplicate(value) {
  return removeAccents(value)
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTypeForDuplicate(value) {
  const type = normalizeTextForDuplicate(value || DEFAULT_TYPE_KEY);

  if (["pendiente", "tarea", "task"].includes(type)) {
    return "pendiente";
  }

  return "evento";
}

export function normalizeDateForDuplicate(value) {
  const text = safeString(value);

  if (!text) {
    return EMPTY_DATE_KEY;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];

    return `${year}-${month}-${day}`;
  }

  const parsedDate = new Date(text);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return normalizeTextForDuplicate(text) || EMPTY_DATE_KEY;
}

export function normalizeTimeForDuplicate(value) {
  const text = safeString(value);

  if (!text) {
    return EMPTY_TIME_KEY;
  }

  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);

  if (timeMatch) {
    const hour = timeMatch[1].padStart(2, "0");
    const minute = timeMatch[2].padStart(2, "0");

    return `${hour}:${minute}`;
  }

  const amPmMatch = text.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);

  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = String(amPmMatch[2] || "00").padStart(2, "0");
    const period = amPmMatch[3];

    if (period === "pm" && hour < 12) {
      hour += 12;
    }

    if (period === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  return normalizeTextForDuplicate(text) || EMPTY_TIME_KEY;
}

export function getDuplicateTitle(item = {}) {
  return normalizeTextForDuplicate(
    item.title ||
    item.titulo ||
    item.name ||
    item.nombre ||
    EMPTY_TITLE_KEY
  ) || EMPTY_TITLE_KEY;
}

export function getDuplicateKey(item = {}) {
  const type = normalizeTypeForDuplicate(item.type || item.tipo);
  const title = getDuplicateTitle(item);
  const date = normalizeDateForDuplicate(item.date || item.fecha || item.startDate || item.fechaInicio);
  const time = normalizeTimeForDuplicate(item.time || item.hora || item.startTime || item.horaInicio);

  return [
    DUPLICATE_KEY_VERSION,
    type,
    title,
    date,
    time
  ].join("|");
}

export function withDuplicateKey(item = {}) {
  return {
    ...item,
    duplicateKey: getDuplicateKey(item)
  };
}

function getTimeValue(value) {
  const time = new Date(value || 0).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function isDeleted(item = {}) {
  return item.deleted === true || item.status === "eliminado" || item.status === "deleted";
}

function isSynced(item = {}) {
  const status = String(item.syncStatus || "").toLowerCase();

  return status === "sincronizado" || status === "synced";
}

function hasExternalPlatformId(item = {}) {
  return Boolean(
    item.googleEventId ||
    item.microsoftEventId ||
    item.telegramMessageId ||
    item.externalId ||
    item.platformIds ||
    item.platformResults
  );
}

function countUsefulFields(item = {}) {
  const fields = [
    "title",
    "description",
    "date",
    "time",
    "endDate",
    "endTime",
    "tag",
    "reminder",
    "reminderTime",
    "source",
    "syncStatus",
    "googleEventId",
    "microsoftEventId",
    "telegramMessageId",
    "platformIds",
    "platformResults"
  ];

  return fields.reduce((total, field) => {
    const value = item[field];

    if (value === null || value === undefined || value === "") {
      return total;
    }

    if (Array.isArray(value) && value.length === 0) {
      return total;
    }

    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      return total;
    }

    return total + 1;
  }, 0);
}

export function getDuplicateScore(item = {}) {
  let score = 0;

  if (!isDeleted(item)) {
    score += 1000;
  }

  if (isSynced(item)) {
    score += 120;
  }

  if (hasExternalPlatformId(item)) {
    score += 100;
  }

  score += countUsefulFields(item) * 10;

  if (item.source === "manual") {
    score += 5;
  }

  if (item.source === "bulk") {
    score += 2;
  }

  score += Math.min(getTimeValue(item.updatedAt || item.createdAt) / 100000000000, 50);

  return score;
}

export function chooseBestDuplicateItem(left = {}, right = {}) {
  const leftScore = getDuplicateScore(left);
  const rightScore = getDuplicateScore(right);

  if (rightScore > leftScore) {
    return right;
  }

  return left;
}

export function mergeDuplicateData(keeper = {}, duplicate = {}) {
  const merged = {
    ...duplicate,
    ...keeper
  };

  const fieldsToFill = [
    "description",
    "endDate",
    "endTime",
    "tag",
    "reminder",
    "reminderTime",
    "googleEventId",
    "microsoftEventId",
    "telegramMessageId",
    "externalId",
    "platformIds",
    "platformResults"
  ];

  fieldsToFill.forEach((field) => {
    if (
      (merged[field] === undefined || merged[field] === null || merged[field] === "") &&
      duplicate[field] !== undefined &&
      duplicate[field] !== null &&
      duplicate[field] !== ""
    ) {
      merged[field] = duplicate[field];
    }
  });

  merged.duplicateKey = getDuplicateKey(merged);
  merged.duplicateCleanedAt = new Date().toISOString();

  return merged;
}

export function dedupeItems(items = []) {
  const groups = new Map();

  for (const rawItem of Array.isArray(items) ? items : []) {
    if (!rawItem || !rawItem.id) {
      continue;
    }

    const item = withDuplicateKey(rawItem);
    const key = item.duplicateKey;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  const uniqueItems = [];
  const duplicateItems = [];
  const idsToDelete = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      uniqueItems.push(group[0]);
      continue;
    }

    let keeper = group[0];

    for (let index = 1; index < group.length; index += 1) {
      keeper = chooseBestDuplicateItem(keeper, group[index]);
    }

    for (const item of group) {
      if (item.id !== keeper.id) {
        duplicateItems.push(item);
        idsToDelete.push(item.id);
        keeper = mergeDuplicateData(keeper, item);
      }
    }

    uniqueItems.push(keeper);
  }

  return {
    uniqueItems,
    duplicateItems,
    idsToDelete,
    stats: {
      total: Array.isArray(items) ? items.length : 0,
      unique: uniqueItems.length,
      duplicates: duplicateItems.length,
      deleted: idsToDelete.length
    }
  };
}

export function buildDuplicateIndex(items = []) {
  const index = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !item.id || isDeleted(item)) {
      continue;
    }

    const key = getDuplicateKey(item);

    if (!index.has(key)) {
      index.set(key, withDuplicateKey(item));
      continue;
    }

    const existing = index.get(key);
    const best = chooseBestDuplicateItem(existing, item);

    index.set(key, mergeDuplicateData(best, best.id === existing.id ? item : existing));
  }

  return index;
}

export function filterIncomingDuplicates(incomingItems = [], existingItems = []) {
  const existingIndex = buildDuplicateIndex(existingItems);
  const acceptedIndex = new Map();

  const uniqueItems = [];
  const duplicateItems = [];
  const skippedItems = [];

  for (const rawItem of Array.isArray(incomingItems) ? incomingItems : []) {
    if (!rawItem) {
      continue;
    }

    const item = withDuplicateKey(rawItem);
    const key = item.duplicateKey;

    const existingDuplicate = existingIndex.get(key);
    const acceptedDuplicate = acceptedIndex.get(key);

    if (existingDuplicate) {
      duplicateItems.push({
        incoming: item,
        existing: existingDuplicate,
        reason: "Ya existe en AgendaJeff."
      });

      skippedItems.push(item);
      continue;
    }

    if (acceptedDuplicate) {
      duplicateItems.push({
        incoming: item,
        existing: acceptedDuplicate,
        reason: "Está repetido dentro de la misma carga."
      });

      skippedItems.push(item);
      continue;
    }

    acceptedIndex.set(key, item);
    uniqueItems.push(item);
  }

  return {
    uniqueItems,
    duplicateItems,
    skippedItems,
    stats: {
      incoming: Array.isArray(incomingItems) ? incomingItems.length : 0,
      accepted: uniqueItems.length,
      skipped: skippedItems.length
    }
  };
}

export function mergeCollectionsWithoutDuplicates(collections = []) {
  const flatItems = collections.flatMap((collection) => {
    return Array.isArray(collection) ? collection : [];
  });

  return dedupeItems(flatItems);
}

export function hasSameDuplicateIdentity(left = {}, right = {}) {
  return getDuplicateKey(left) === getDuplicateKey(right);
}

export function buildDuplicateSummary(result = {}) {
  const stats = result.stats || {};

  return {
    total: stats.total ?? stats.incoming ?? 0,
    unique: stats.unique ?? stats.accepted ?? 0,
    duplicates: stats.duplicates ?? stats.skipped ?? 0,
    deleted: stats.deleted ?? 0
  };
}