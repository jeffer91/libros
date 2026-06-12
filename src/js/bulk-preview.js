/*
=========================================================
Nombre completo: bulk-preview.js
Ruta o ubicación: /src/js/bulk-preview.js

Función o funciones:
1. Controlar la vista previa de carga masiva.
2. Procesar texto pegado y archivos compatibles.
3. Mostrar registros detectados antes de guardarlos.
4. Permitir editar registros antes de confirmar.
5. Enviar los registros válidos a app.js para guardado local-first.
6. Evitar que la carga masiva se quede solo en memoria temporal.
7. Corregir el conteo de registros válidos usando validation.ok.

Con qué se conecta:
- renderer.html
- src/js/bulk-parser.js
- src/js/events.js
- src/js/app.js
- src/js/sync-service.js

Para qué sirve:
Sirve para que la carga masiva revise datos antes de guardarlos, pero sin guardar
directamente ni enviar a plataformas. El guardado real lo hace app.js.
=========================================================
*/

import {
  parseFileToItems,
  parseTextToItems
} from "./bulk-parser.js";

import { buildAgendaItem } from "./events.js";

const DEFAULT_TYPE = "evento";
const DEFAULT_TIME = "09:00";
const DEFAULT_TAG = "Trabajo";
const DEFAULT_REMINDER = "mismo_dia";
const BULK_SOURCE = "bulk";

let currentPreviewRows = [];
let bulkPreviewInitialized = false;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getValue(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function getBulkElements() {
  return {
    textArea: document.getElementById("bulkText"),
    fileInput: document.getElementById("bulkFile"),
    processButton: document.getElementById("btnProcessBulk"),
    previewBox: document.getElementById("bulkPreviewBox")
  };
}

function getRowItem(row = {}) {
  if (row.item && typeof row.item === "object") {
    return row.item;
  }

  if (row.record && typeof row.record === "object") {
    return row.record;
  }

  if (row.data && typeof row.data === "object") {
    return row.data;
  }

  if (row && typeof row === "object") {
    return row;
  }

  return {};
}

function getRowRawValue(row = {}) {
  return row.raw || row.original || row.text || "";
}

function getRowErrors(row = {}) {
  const errors = [];

  if (Array.isArray(row.errors)) {
    errors.push(...row.errors);
  }

  if (Array.isArray(row.validation?.errors)) {
    errors.push(...row.validation.errors);
  }

  if (row.error) {
    errors.push(row.error);
  }

  return errors
    .map((error) => getValue(error))
    .filter(Boolean);
}

function uniqueErrors(errors = []) {
  return [...new Set(errors.map((error) => getValue(error)).filter(Boolean))];
}

function buildItemFromData(data = {}) {
  const safeData = data && typeof data === "object" ? data : {};

  return buildAgendaItem({
    ...safeData,
    type: safeData.type || DEFAULT_TYPE,
    title: safeData.title || "",
    date: safeData.date || "",
    time: safeData.time || DEFAULT_TIME,
    endDate: safeData.endDate || "",
    endTime: safeData.endTime || "",
    tag: safeData.tag || DEFAULT_TAG,
    reminder: safeData.reminder || DEFAULT_REMINDER,
    reminderTime: safeData.reminderTime || "",
    description: safeData.description || "",
    source: BULK_SOURCE
  });
}

function normalizePreviewRow(row = {}, index = 0) {
  const originalItem = getRowItem(row);
  const result = buildItemFromData(originalItem);
  const parserErrors = getRowErrors(row);
  const validationErrors = Array.isArray(result.validation?.errors)
    ? result.validation.errors
    : [];

  const explicitInvalid = row.valid === false || row.validation?.ok === false;
  const errors = uniqueErrors([
    ...parserErrors,
    ...validationErrors,
    ...(explicitInvalid && parserErrors.length === 0 && validationErrors.length === 0
      ? ["Revisa este registro antes de guardarlo."]
      : [])
  ]);

  const itemId = originalItem.id || result.item.id || row.id || `bulk-row-${index}`;

  return {
    id: itemId,
    index,
    item: {
      ...result.item,
      id: itemId,
      source: BULK_SOURCE
    },
    validation: {
      ok: !explicitInvalid && result.validation?.ok === true && errors.length === 0,
      errors
    },
    raw: getRowRawValue(row)
  };
}

function normalizePreviewRows(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row, index) => normalizePreviewRow(row, index));
}

function summarizeRows(rows = []) {
  const total = rows.length;
  const valid = rows.filter((row) => row.validation?.ok === true).length;

  return {
    total,
    valid,
    invalid: total - valid
  };
}

function refreshRowValidation(index) {
  const row = currentPreviewRows[index];

  if (!row) {
    return;
  }

  const result = buildItemFromData(row.item);
  const errors = uniqueErrors(result.validation?.errors || []);
  const itemId = row.item?.id || result.item.id || row.id || `bulk-row-${index}`;

  currentPreviewRows[index] = {
    ...row,
    id: itemId,
    item: {
      ...result.item,
      id: itemId,
      source: BULK_SOURCE
    },
    validation: {
      ok: result.validation?.ok === true && errors.length === 0,
      errors
    }
  };
}

function refreshAllRowsValidation() {
  currentPreviewRows.forEach((_row, index) => {
    refreshRowValidation(index);
  });
}

function getValidPreviewItems() {
  refreshAllRowsValidation();

  return currentPreviewRows
    .filter((row) => row.validation?.ok === true)
    .map((row) => ({
      ...row.item,
      source: BULK_SOURCE
    }));
}

function updatePreviewRowField(index, field, value, shouldRefresh = true) {
  const row = currentPreviewRows[index];

  if (!row || !field) {
    return;
  }

  currentPreviewRows[index] = {
    ...row,
    item: {
      ...row.item,
      [field]: value
    }
  };

  if (shouldRefresh) {
    refreshRowValidation(index);
  }
}

function renderErrors(row = {}) {
  const errors = row.validation?.errors || [];

  if (!errors.length) {
    return `<span class="bulk-ok">Correcto</span>`;
  }

  return `<span class="bulk-error">${escapeHTML(errors.join(" "))}</span>`;
}

function renderInput(index, field, value, type = "text", placeholder = "") {
  return `
    <input
      class="bulk-preview-input"
      type="${escapeHTML(type)}"
      data-bulk-index="${escapeHTML(index)}"
      data-bulk-field="${escapeHTML(field)}"
      value="${escapeHTML(value)}"
      placeholder="${escapeHTML(placeholder)}"
    />
  `;
}

function renderSelect(index, field, value, options = []) {
  const currentValue = String(value || "");

  return `
    <select
      class="bulk-preview-input"
      data-bulk-index="${escapeHTML(index)}"
      data-bulk-field="${escapeHTML(field)}"
    >
      ${options.map((option) => {
        const selected = option.value === currentValue ? "selected" : "";

        return `<option value="${escapeHTML(option.value)}" ${selected}>${escapeHTML(option.label)}</option>`;
      }).join("")}
    </select>
  `;
}

function renderBulkRow(row = {}, index = 0) {
  const item = row.item || {};
  const isValid = row.validation?.ok === true;

  return `
    <div class="bulk-preview-row ${isValid ? "is-valid" : "is-invalid"}" data-bulk-row="${escapeHTML(index)}">
      <div class="bulk-preview-grid">
        <label>
          <span>Fecha</span>
          ${renderInput(index, "date", item.date || "", "date", "Fecha")}
        </label>

        <label>
          <span>Hora</span>
          ${renderInput(index, "time", item.time || DEFAULT_TIME, "time", "Hora")}
        </label>

        <label>
          <span>Tipo</span>
          ${renderSelect(index, "type", item.type || DEFAULT_TYPE, [
            { value: "evento", label: "Evento" },
            { value: "pendiente", label: "Pendiente" }
          ])}
        </label>

        <label>
          <span>Etiqueta</span>
          ${renderInput(index, "tag", item.tag || DEFAULT_TAG, "text", "Etiqueta")}
        </label>

        <label class="bulk-preview-wide">
          <span>Título</span>
          ${renderInput(index, "title", item.title || "", "text", "Título del evento")}
        </label>

        <label class="bulk-preview-wide">
          <span>Descripción</span>
          ${renderInput(index, "description", item.description || "", "text", "Detalle")}
        </label>
      </div>

      <div class="bulk-preview-status">
        ${renderErrors(row)}
      </div>
    </div>
  `;
}

function renderEmptyPreview(message) {
  const { previewBox } = getBulkElements();

  if (!previewBox) {
    return;
  }

  previewBox.innerHTML = `
    <p class="bulk-empty">${escapeHTML(message)}</p>
  `;
}

function bindPreviewActions(previewBox) {
  previewBox.querySelector("#btnClearBulkPreview")?.addEventListener("click", clearBulkPreview);
  previewBox.querySelector("#btnConfirmBulkPreview")?.addEventListener("click", confirmBulkPreview);

  previewBox.querySelectorAll("[data-bulk-field]").forEach((input) => {
    input.addEventListener("input", handleBulkFieldInput);
    input.addEventListener("change", handleBulkFieldChange);
  });
}

function renderBulkPreview(rows = []) {
  const { previewBox } = getBulkElements();

  if (!previewBox) {
    return;
  }

  if (!rows.length) {
    renderEmptyPreview("No se detectaron registros. Pega texto, tabla o sube un archivo válido.");
    return;
  }

  const summary = summarizeRows(rows);

  previewBox.innerHTML = `
    <div class="bulk-preview-summary">
      <strong>Procesados: ${escapeHTML(summary.total)}</strong>
      <span>Correctos: ${escapeHTML(summary.valid)}</span>
      <span>Con errores: ${escapeHTML(summary.invalid)}</span>
    </div>

    <div class="bulk-preview-list">
      ${rows.map((row, index) => renderBulkRow(row, index)).join("")}
    </div>

    <div class="modal-actions">
      <button type="button" class="btn btn-soft" id="btnClearBulkPreview">Limpiar</button>
      <button type="button" class="btn btn-primary" id="btnConfirmBulkPreview" ${summary.valid === 0 ? "disabled" : ""}>
        Guardar registros válidos
      </button>
    </div>
  `;

  bindPreviewActions(previewBox);
}

function handleBulkFieldInput(event) {
  const index = Number(event.target.dataset.bulkIndex);
  const field = event.target.dataset.bulkField;

  if (!Number.isInteger(index) || !field) {
    return;
  }

  updatePreviewRowField(index, field, event.target.value, false);
}

function handleBulkFieldChange(event) {
  const index = Number(event.target.dataset.bulkIndex);
  const field = event.target.dataset.bulkField;

  if (!Number.isInteger(index) || !field) {
    return;
  }

  updatePreviewRowField(index, field, event.target.value, true);
  renderBulkPreview(currentPreviewRows);
}

function clearBulkPreview() {
  const { textArea, fileInput } = getBulkElements();

  currentPreviewRows = [];

  if (textArea) {
    textArea.value = "";
  }

  if (fileInput) {
    fileInput.value = "";
  }

  renderEmptyPreview("Carga masiva limpia. Pega texto o sube un archivo para procesar.");
}

function confirmBulkPreview() {
  const validItems = getValidPreviewItems();

  if (!validItems.length) {
    alert("No hay registros válidos para guardar.");
    renderBulkPreview(currentPreviewRows);
    return;
  }

  renderBulkPreview(currentPreviewRows);

  window.dispatchEvent(new CustomEvent("agendaJeff:bulk-confirmed", {
    detail: {
      items: validItems,
      source: "bulk-preview"
    }
  }));
}

async function processBulkText(text) {
  const rows = await parseTextToItems(text);

  currentPreviewRows = normalizePreviewRows(rows);
  renderBulkPreview(currentPreviewRows);
}

async function processBulkFile(file) {
  const rows = await parseFileToItems(file);

  currentPreviewRows = normalizePreviewRows(rows);
  renderBulkPreview(currentPreviewRows);
}

async function handleProcessBulk() {
  const { textArea, fileInput, processButton } = getBulkElements();
  const text = getValue(textArea?.value);
  const file = fileInput?.files?.[0] || null;

  if (!text && !file) {
    alert("Pega texto o sube un archivo para procesar la carga masiva.");
    return;
  }

  if (processButton) {
    processButton.disabled = true;
    processButton.textContent = "Procesando...";
  }

  try {
    if (file) {
      await processBulkFile(file);
    } else {
      await processBulkText(text);
    }
  } catch (error) {
    console.error(error);
    alert(error.message || "No se pudo procesar la carga masiva.");
  } finally {
    if (processButton) {
      processButton.disabled = false;
      processButton.textContent = "Procesar";
    }
  }
}

export function initBulkPreview() {
  const { processButton, previewBox } = getBulkElements();

  if (!processButton || !previewBox) {
    return;
  }

  if (!bulkPreviewInitialized) {
    processButton.addEventListener("click", handleProcessBulk);
    window.addEventListener("agendaJeff:bulk-saved", clearBulkPreview);
    bulkPreviewInitialized = true;
  }

  if (!previewBox.innerHTML.trim()) {
    renderEmptyPreview("Pega texto, copia una tabla o sube un archivo para generar la vista previa.");
  }
}

export function getCurrentPreviewRows() {
  return currentPreviewRows;
}

export function resetBulkPreview() {
  clearBulkPreview();
}