/*
=========================================================
Nombre completo: event-editor.js
Ruta o ubicación: /src/js/event-editor.js

Función o funciones:
1. Mantener el estado temporal de edición por fila.
2. Detectar cambios reales antes de guardar.
3. Validar borradores de edición.
4. Construir eventos actualizados sin perder id, fechas de creación ni recordatorios.
5. Permitir guardar una fila o todas las filas editadas.

Con qué se conecta:
- src/js/app.js
- src/js/editable-events-table.js
- src/js/events.js

Para qué sirve:
Sirve como controlador interno de la edición rápida de eventos
y pendientes en tabla.
=========================================================
*/

import {
  buildAgendaItem,
  ITEM_STATUS,
  ITEM_TYPES,
  updateAgendaItem,
  validateAgendaItem
} from "./events.js";

const editorState = {
  drafts: new Map()
};

const EDITABLE_FIELDS = [
  "type",
  "title",
  "date",
  "time",
  "tag",
  "description",
  "status"
];

export function getEditableFields() {
  return [...EDITABLE_FIELDS];
}

export function cloneEditableData(item = {}) {
  return {
    type: item.type || ITEM_TYPES.EVENTO,
    title: item.title || "",
    date: item.date || "",
    time: item.time || "",
    tag: item.tag || "Trabajo",
    description: item.description || "",
    status: item.status || ITEM_STATUS.ACTIVO
  };
}

export function getOriginalComparable(item = {}) {
  return cloneEditableData(item);
}

export function normalizeComparableValue(value) {
  return String(value ?? "").trim();
}

export function areDraftsEqual(left = {}, right = {}) {
  return EDITABLE_FIELDS.every((fieldName) => {
    return normalizeComparableValue(left[fieldName]) === normalizeComparableValue(right[fieldName]);
  });
}

export function startEditingItem(item = {}) {
  if (!item?.id) {
    return null;
  }

  if (!editorState.drafts.has(item.id)) {
    editorState.drafts.set(item.id, cloneEditableData(item));
  }

  return getDraft(item.id);
}

export function cancelEditingItem(itemId) {
  editorState.drafts.delete(itemId);
}

export function cancelAllEditing() {
  editorState.drafts.clear();
}

export function isItemBeingEdited(itemId) {
  return editorState.drafts.has(itemId);
}

export function getDraft(itemId) {
  return editorState.drafts.get(itemId) || null;
}

export function getDraftForRender(item = {}) {
  return getDraft(item.id) || cloneEditableData(item);
}

export function setDraftField(itemId, fieldName, value) {
  if (!itemId || !EDITABLE_FIELDS.includes(fieldName)) {
    return null;
  }

  const currentDraft = editorState.drafts.get(itemId) || {};
  const nextDraft = {
    ...currentDraft,
    [fieldName]: value
  };

  editorState.drafts.set(itemId, nextDraft);

  return nextDraft;
}

export function getEditingItemIds() {
  return Array.from(editorState.drafts.keys());
}

export function hasDraftChanges(itemId, originalItem = {}) {
  const draft = getDraft(itemId);

  if (!draft) {
    return false;
  }

  return !areDraftsEqual(draft, getOriginalComparable(originalItem));
}

export function getDirtyItemIds(items = []) {
  return items
    .filter((item) => hasDraftChanges(item.id, item))
    .map((item) => item.id);
}

export function validateEditedDraft(draft = {}) {
  const { item } = buildAgendaItem({
    ...draft,
    id: "preview-validation",
    createdAt: new Date().toISOString(),
    source: "editor"
  });

  return validateAgendaItem(item);
}

export function buildEditedAgendaItem(originalItem = {}) {
  if (!originalItem?.id) {
    return {
      ok: false,
      errors: ["No se encontró el evento original."],
      item: null
    };
  }

  const draft = getDraft(originalItem.id);

  if (!draft) {
    return {
      ok: false,
      errors: ["La fila no está en edición."],
      item: null
    };
  }

  const result = updateAgendaItem(originalItem, draft);

  return {
    ok: result.validation.ok,
    errors: result.validation.errors,
    item: result.item
  };
}

export function finishEditingItem(itemId) {
  editorState.drafts.delete(itemId);
}

export function findItemById(items = [], itemId) {
  return items.find((item) => item.id === itemId) || null;
}

export function getEditedItemsReadyToSave(items = []) {
  const ready = [];
  const errors = [];

  getEditingItemIds().forEach((itemId) => {
    const originalItem = findItemById(items, itemId);

    if (!originalItem) {
      errors.push({
        itemId,
        errors: ["No se encontró el registro original."]
      });
      return;
    }

    if (!hasDraftChanges(itemId, originalItem)) {
      return;
    }

    const result = buildEditedAgendaItem(originalItem);

    if (!result.ok) {
      errors.push({
        itemId,
        title: originalItem.title,
        errors: result.errors
      });
      return;
    }

    ready.push(result.item);
  });

  return {
    ok: errors.length === 0,
    ready,
    errors
  };
}

export function formatEditorErrors(errors = []) {
  if (!errors.length) {
    return "";
  }

  return errors.map((error) => {
    const prefix = error.title ? `${error.title}: ` : "";
    return `${prefix}${error.errors.join(" · ")}`;
  }).join("\n");
}

export function getEditorSnapshot() {
  return {
    editingIds: getEditingItemIds(),
    totalEditing: editorState.drafts.size
  };
}