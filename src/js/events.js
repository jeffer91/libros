/*
=========================================================
Nombre completo: events.js
Ruta o ubicación: /src/js/events.js

Función o funciones:
1. Crear eventos y pendientes.
2. Validar campos obligatorios.
3. Completar pendientes o eventos.
4. Marcar eventos pasados.
5. Calcular fecha de eliminación automática después de un mes.
6. Guardar hora personalizada de recordatorio para carga masiva.
7. Actualizar eventos desde la tabla editable sin duplicar registros.

Con qué se conecta:
- src/js/state.js
- src/js/local-db.js
- src/js/sync-service.js
- src/js/reminders.js
- src/js/ui.js
- src/js/event-editor.js

Para qué sirve:
Sirve para manejar la lógica central de eventos y pendientes.
=========================================================
*/

export const ITEM_TYPES = {
  EVENTO: "evento",
  PENDIENTE: "pendiente"
};

export const ITEM_STATUS = {
  ACTIVO: "activo",
  COMPLETADO: "completado",
  PASADO: "pasado"
};

export const SYNC_STATUS = {
  PENDIENTE: "pendiente",
  SINCRONIZADO: "sincronizado",
  ERROR: "error"
};

export const BASE_TAGS = [
  "Trabajo",
  "Personal",
  "Titulación",
  "Reunión",
  "Urgente",
  "Pago",
  "Académico"
];

export const BASE_REMINDERS = [
  "mismo_dia",
  "tres_dias_antes",
  "cinco_dias_antes",
  "hasta_completar"
];

export function createAgendaId() {
  const random = Math.random().toString(16).slice(2);
  return `aj-${Date.now()}-${random}`;
}

export function getNowISO() {
  return new Date().toISOString();
}

export function addMonthsToDate(date, months = 1) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getDeleteAfterDate(baseDate = new Date()) {
  return addMonthsToDate(baseDate, 1).toISOString();
}

export function normalizeItemType(type) {
  const value = String(type || "").trim().toLowerCase();

  if (value === ITEM_TYPES.PENDIENTE || value === "tarea" || value === "task") {
    return ITEM_TYPES.PENDIENTE;
  }

  return ITEM_TYPES.EVENTO;
}

export function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();

  if (value === ITEM_STATUS.COMPLETADO) {
    return ITEM_STATUS.COMPLETADO;
  }

  if (value === ITEM_STATUS.PASADO) {
    return ITEM_STATUS.PASADO;
  }

  return ITEM_STATUS.ACTIVO;
}

export function normalizeTag(tag) {
  const clean = String(tag || "").trim();

  if (!clean) {
    return "Trabajo";
  }

  const found = BASE_TAGS.find((baseTag) => {
    return baseTag.toLowerCase() === clean.toLowerCase();
  });

  return found || clean;
}

export function normalizeReminder(reminder, type = ITEM_TYPES.EVENTO) {
  const clean = String(reminder || "").trim().toLowerCase();

  if (BASE_REMINDERS.includes(clean)) {
    return clean;
  }

  if (type === ITEM_TYPES.PENDIENTE) {
    return "hasta_completar";
  }

  return "mismo_dia";
}

export function normalizeTimeValue(time) {
  const clean = String(time || "").trim();

  if (!clean) {
    return "";
  }

  const match = clean.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return "";
  }

  return `${match[1]}:${match[2]}`;
}

export function normalizeOptionalDate(date) {
  const clean = String(date || "").trim();

  if (!clean) {
    return "";
  }

  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return "";
  }

  const parsed = new Date(`${clean}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return clean;
}

export function normalizeTextValue(value) {
  return String(value || "").trim();
}

export function validateAgendaItem(item = {}) {
  const errors = [];
  const type = normalizeItemType(item.type);

  if (!normalizeTextValue(item.title)) {
    errors.push("El título es obligatorio.");
  }

  if (!normalizeTextValue(item.description)) {
    errors.push("La descripción es obligatoria.");
  }

  if (type === ITEM_TYPES.EVENTO) {
    if (!item.date) {
      errors.push("Los eventos necesitan fecha.");
    }

    if (!item.time) {
      errors.push("Los eventos necesitan hora.");
    }
  }

  if (item.date && !normalizeOptionalDate(item.date)) {
    errors.push("La fecha debe tener formato válido.");
  }

  if (item.endDate && !normalizeOptionalDate(item.endDate)) {
    errors.push("La fecha fin debe tener formato válido.");
  }

  if (item.time && !normalizeTimeValue(item.time)) {
    errors.push("La hora debe tener formato HH:MM.");
  }

  if (item.endTime && !normalizeTimeValue(item.endTime)) {
    errors.push("La hora fin debe tener formato HH:MM.");
  }

  if (item.reminderTime && !normalizeTimeValue(item.reminderTime)) {
    errors.push("La hora de recordatorio debe tener formato HH:MM.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildAgendaItem(input = {}) {
  const type = normalizeItemType(input.type);
  const now = getNowISO();

  const item = {
    id: input.id || createAgendaId(),
    type,
    title: normalizeTextValue(input.title),
    date: normalizeOptionalDate(input.date) || normalizeTextValue(input.date),
    endDate: normalizeOptionalDate(input.endDate) || normalizeTextValue(input.endDate),
    time: normalizeTimeValue(input.time),
    endTime: normalizeTimeValue(input.endTime),
    reminderTime: normalizeTimeValue(input.reminderTime),
    tag: normalizeTag(input.tag),
    reminder: normalizeReminder(input.reminder, type),
    description: normalizeTextValue(input.description),
    status: normalizeStatus(input.status),
    syncStatus: input.syncStatus || SYNC_STATUS.PENDIENTE,
    platformSync: input.platformSync || {
      telegram: "pendiente",
      google: "pendiente",
      microsoft: "pendiente",
      desktop: "pendiente"
    },
    remindersSent: input.remindersSent || {},
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    completedAt: input.completedAt || null,
    deleteAfter: input.deleteAfter || null,
    source: input.source || "manual"
  };

  const validation = validateAgendaItem(item);

  return {
    item,
    validation
  };
}

export function shouldReactivateEditedPastItem(originalItem = {}, nextItem = {}) {
  if (originalItem.status !== ITEM_STATUS.PASADO) {
    return false;
  }

  if (!nextItem.date) {
    return false;
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  return nextItem.date >= todayISO;
}

export function updateAgendaItem(originalItem = {}, changes = {}) {
  const now = getNowISO();
  const merged = {
    ...originalItem,
    ...changes,
    id: originalItem.id,
    createdAt: originalItem.createdAt || now,
    updatedAt: now,
    source: originalItem.source || changes.source || "manual",
    syncStatus: SYNC_STATUS.PENDIENTE,
    platformSync: originalItem.platformSync || {
      telegram: "pendiente",
      google: "pendiente",
      microsoft: "pendiente",
      desktop: "pendiente"
    },
    remindersSent: originalItem.remindersSent || {},
    completedAt: originalItem.completedAt || null,
    deleteAfter: originalItem.deleteAfter || null
  };

  const result = buildAgendaItem(merged);
  let item = {
    ...originalItem,
    ...result.item,
    id: originalItem.id,
    createdAt: originalItem.createdAt || result.item.createdAt,
    updatedAt: now,
    syncStatus: SYNC_STATUS.PENDIENTE
  };

  if (item.status === ITEM_STATUS.COMPLETADO && !item.completedAt) {
    item = {
      ...item,
      completedAt: now,
      deleteAfter: item.deleteAfter || getDeleteAfterDate(new Date())
    };
  }

  if (item.status === ITEM_STATUS.ACTIVO) {
    item = {
      ...item,
      completedAt: null,
      deleteAfter: null
    };
  }

  if (shouldReactivateEditedPastItem(originalItem, item)) {
    item = {
      ...item,
      status: ITEM_STATUS.ACTIVO,
      deleteAfter: null
    };
  }

  const validation = validateAgendaItem(item);

  return {
    item,
    validation
  };
}

export function completeAgendaItem(item = {}) {
  const now = new Date();

  return {
    ...item,
    status: ITEM_STATUS.COMPLETADO,
    completedAt: now.toISOString(),
    deleteAfter: getDeleteAfterDate(now),
    updatedAt: now.toISOString(),
    syncStatus: SYNC_STATUS.PENDIENTE
  };
}

export function markPastIfNeeded(item = {}) {
  if (item.status === ITEM_STATUS.COMPLETADO) {
    return item;
  }

  if (item.type !== ITEM_TYPES.EVENTO) {
    return item;
  }

  if (!item.date) {
    return item;
  }

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  if (item.date < todayISO) {
    return {
      ...item,
      status: ITEM_STATUS.PASADO,
      deleteAfter: item.deleteAfter || getDeleteAfterDate(today),
      updatedAt: today.toISOString(),
      syncStatus: SYNC_STATUS.PENDIENTE
    };
  }

  return item;
}

export function shouldDeleteAutomatically(item = {}, referenceDate = new Date()) {
  if (!item.deleteAfter) {
    return false;
  }

  const deleteAt = new Date(item.deleteAfter);

  if (Number.isNaN(deleteAt.getTime())) {
    return false;
  }

  return deleteAt <= referenceDate;
}

export function cleanDeletedItems(items = []) {
  const now = new Date();

  return items.filter((item) => {
    return !shouldDeleteAutomatically(item, now);
  });
}

export function normalizeAgendaItems(items = []) {
  return cleanDeletedItems(items).map((item) => {
    const normalized = buildAgendaItem(item).item;
    return markPastIfNeeded(normalized);
  });
}