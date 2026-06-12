/*
=========================================================
Nombre completo: editable-events-table.js
Ruta o ubicación: /src/js/editable-events-table.js

Función o funciones:
1. Renderizar eventos y pendientes como tabla editable compacta.
2. Mostrar filas en modo lectura o modo edición.
3. Dibujar inputs, selects y acciones por fila.
4. Mostrar contador de cambios sin guardar.
5. Mantener una vista rápida, limpia y fácil de corregir.

Con qué se conecta:
- src/js/ui.js
- src/js/event-editor.js
- src/js/events.js
- src/css/editable-table.css

Para qué sirve:
Sirve para convertir la lista principal de AgendaJeff en una tabla
editable, compacta e inteligente.
=========================================================
*/

import {
  getDirtyItemIds,
  getEditingItemIds,
  getDraftForRender,
  hasDraftChanges,
  isItemBeingEdited,
  validateEditedDraft
} from "./event-editor.js";

import {
  BASE_TAGS,
  ITEM_STATUS,
  ITEM_TYPES
} from "./events.js";

const STATUS_OPTIONS = [
  {
    value: ITEM_STATUS.ACTIVO,
    label: "Activo"
  },
  {
    value: ITEM_STATUS.COMPLETADO,
    label: "Completado"
  },
  {
    value: ITEM_STATUS.PASADO,
    label: "Pasado"
  }
];

const TYPE_OPTIONS = [
  {
    value: ITEM_TYPES.EVENTO,
    label: "Evento"
  },
  {
    value: ITEM_TYPES.PENDIENTE,
    label: "Pendiente"
  }
];

export function escapeTableHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeTableValue(value) {
  return String(value ?? "").trim();
}

export function getReadableStatus(status) {
  const clean = normalizeTableValue(status).toLowerCase();

  if (clean === ITEM_STATUS.COMPLETADO) {
    return {
      label: "Completado",
      className: "is-completed"
    };
  }

  if (clean === ITEM_STATUS.PASADO) {
    return {
      label: "Pasado",
      className: "is-past"
    };
  }

  return {
    label: "Activo",
    className: "is-active"
  };
}

export function getReadableType(type) {
  const clean = normalizeTableValue(type).toLowerCase();

  if (clean === ITEM_TYPES.PENDIENTE) {
    return "Pendiente";
  }

  return "Evento";
}

export function renderOptions(options = [], selectedValue = "") {
  const selected = normalizeTableValue(selectedValue).toLowerCase();

  return options.map((option) => {
    const optionValue = normalizeTableValue(option.value);
    const isSelected = optionValue.toLowerCase() === selected ? "selected" : "";

    return `
      <option value="${escapeTableHTML(optionValue)}" ${isSelected}>
        ${escapeTableHTML(option.label)}
      </option>
    `;
  }).join("");
}

export function renderTagOptions(selectedValue = "") {
  const selected = normalizeTableValue(selectedValue);
  const tags = [...BASE_TAGS];

  if (selected && !tags.some((tag) => tag.toLowerCase() === selected.toLowerCase())) {
    tags.push(selected);
  }

  return tags.map((tag) => {
    const isSelected = tag.toLowerCase() === selected.toLowerCase() ? "selected" : "";

    return `
      <option value="${escapeTableHTML(tag)}" ${isSelected}>
        ${escapeTableHTML(tag)}
      </option>
    `;
  }).join("");
}

export function renderReadCell(value, fallback = "—") {
  const clean = normalizeTableValue(value);

  if (!clean) {
    return `<span class="editable-muted">${escapeTableHTML(fallback)}</span>`;
  }

  return escapeTableHTML(clean);
}

export function renderInputCell(itemId, fieldName, value, type = "text", extraClass = "") {
  return `
    <input
      class="editable-input ${extraClass}"
      data-editor-field="${escapeTableHTML(fieldName)}"
      data-id="${escapeTableHTML(itemId)}"
      type="${escapeTableHTML(type)}"
      value="${escapeTableHTML(value)}"
    />
  `;
}

export function renderSelectCell(itemId, fieldName, value, optionsHTML, extraClass = "") {
  return `
    <select
      class="editable-input ${extraClass}"
      data-editor-field="${escapeTableHTML(fieldName)}"
      data-id="${escapeTableHTML(itemId)}"
    >
      ${optionsHTML}
    </select>
  `;
}

export function renderStatusBadge(status) {
  const statusView = getReadableStatus(status);

  return `
    <span class="status-badge ${statusView.className}">
      ${escapeTableHTML(statusView.label)}
    </span>
  `;
}

export function renderTableToolbar(items = []) {
  const editingCount = getEditingItemIds().length;
  const dirtyCount = getDirtyItemIds(items).length;

  if (!editingCount) {
    return `
      <div class="editable-table-toolbar">
        <span class="editable-table-hint">
          Clic en ✎ para editar una fila. Todo se guarda local primero y luego se sincroniza.
        </span>
      </div>
    `;
  }

  return `
    <div class="editable-table-toolbar is-active">
      <span class="editable-table-hint">
        ${editingCount} fila(s) en edición · ${dirtyCount} cambio(s) sin guardar
      </span>

      <div class="editable-table-toolbar-actions">
        <button
          type="button"
          class="btn btn-soft editable-toolbar-btn"
          data-action="cancel-all-edits"
        >
          Cancelar todo
        </button>

        <button
          type="button"
          class="btn btn-primary editable-toolbar-btn"
          data-action="save-all-edits"
          ${dirtyCount ? "" : "disabled"}
        >
          Guardar cambios
        </button>
      </div>
    </div>
  `;
}

export function renderReadRow(item = {}) {
  const statusView = getReadableStatus(item.status);

  return `
    <tr class="editable-row" data-id="${escapeTableHTML(item.id)}">
      <td class="editable-date-cell">
        <strong>${renderReadCell(item.date)}</strong>
      </td>

      <td class="editable-time-cell">
        ${renderReadCell(item.time)}
      </td>

      <td>
        <span class="event-type">${escapeTableHTML(getReadableType(item.type))}</span>
      </td>

      <td>
        <span class="event-tag">${escapeTableHTML(item.tag || "Trabajo")}</span>
      </td>

      <td class="editable-title-cell">
        <strong title="${escapeTableHTML(item.title)}">${renderReadCell(item.title)}</strong>
      </td>

      <td class="editable-description-cell">
        <span title="${escapeTableHTML(item.description)}">${renderReadCell(item.description)}</span>
      </td>

      <td>
        <span class="status-badge ${statusView.className}">
          ${escapeTableHTML(statusView.label)}
        </span>
      </td>

      <td class="editable-actions-cell">
        <button
          type="button"
          class="action-mini"
          data-action="complete"
          data-id="${escapeTableHTML(item.id)}"
          title="Completar"
        >
          ✓
        </button>

        <button
          type="button"
          class="action-mini"
          data-action="edit"
          data-id="${escapeTableHTML(item.id)}"
          title="Editar"
        >
          ✎
        </button>
      </td>
    </tr>
  `;
}

export function renderEditRow(item = {}) {
  const draft = getDraftForRender(item);
  const validation = validateEditedDraft(draft);
  const dirtyClass = hasDraftChanges(item.id, item) ? "is-dirty" : "";
  const errorClass = validation.ok ? "" : "is-invalid";

  return `
    <tr
      class="editable-row is-editing ${dirtyClass} ${errorClass}"
      data-id="${escapeTableHTML(item.id)}"
    >
      <td class="editable-date-cell">
        ${renderInputCell(item.id, "date", draft.date, "date")}
      </td>

      <td class="editable-time-cell">
        ${renderInputCell(item.id, "time", draft.time, "time")}
      </td>

      <td>
        ${renderSelectCell(
          item.id,
          "type",
          draft.type,
          renderOptions(TYPE_OPTIONS, draft.type)
        )}
      </td>

      <td>
        ${renderSelectCell(
          item.id,
          "tag",
          draft.tag,
          renderTagOptions(draft.tag)
        )}
      </td>

      <td class="editable-title-cell">
        ${renderInputCell(item.id, "title", draft.title, "text", "is-title")}
      </td>

      <td class="editable-description-cell">
        ${renderInputCell(item.id, "description", draft.description, "text", "is-description")}
      </td>

      <td>
        ${renderSelectCell(
          item.id,
          "status",
          draft.status,
          renderOptions(STATUS_OPTIONS, draft.status)
        )}
      </td>

      <td class="editable-actions-cell">
        <button
          type="button"
          class="action-mini is-save"
          data-action="save-edit"
          data-id="${escapeTableHTML(item.id)}"
          title="Guardar fila"
        >
          ✓
        </button>

        <button
          type="button"
          class="action-mini is-cancel"
          data-action="cancel-edit"
          data-id="${escapeTableHTML(item.id)}"
          title="Cancelar"
        >
          ×
        </button>
      </td>
    </tr>

    ${validation.ok ? "" : `
      <tr class="editable-error-row" data-error-for="${escapeTableHTML(item.id)}">
        <td colspan="8">
          ${escapeTableHTML(validation.errors.join(" · "))}
        </td>
      </tr>
    `}
  `;
}

export function renderEditableTableRows(items = []) {
  return items.map((item) => {
    if (isItemBeingEdited(item.id)) {
      return renderEditRow(item);
    }

    return renderReadRow(item);
  }).join("");
}

export function renderEditableEventsTable(items = []) {
  if (!items.length) {
    return "";
  }

  return `
    ${renderTableToolbar(items)}

    <div class="editable-table-shell">
      <table class="editable-events-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Etiqueta</th>
            <th>Título</th>
            <th>Detalle</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          ${renderEditableTableRows(items)}
        </tbody>
      </table>
    </div>
  `;
}