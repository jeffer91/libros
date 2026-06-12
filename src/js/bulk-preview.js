/*
=========================================================
Nombre completo: bulk-preview.js
Ruta o ubicación: /src/js/bulk-preview.js

Función o funciones:
1. Controlar el popup de carga masiva.
2. Procesar texto pegado y archivos.
3. Mostrar vista previa editable.
4. Separar registros correctos y registros con error.
5. Preparar registros para guardarlos.

Con qué se conecta:
- renderer.html
- src/js/bulk-parser.js
- src/js/events.js
- src/js/ui.js
- src/js/local-db.js

Para qué sirve:
Sirve para que la carga masiva no guarde directo,
sino que primero muestre una revisión.
=========================================================
*/

import { parseTextToItems, parseFileToItems, summarizeBulkResult } from "./bulk-parser.js";
import { buildAgendaItem } from "./events.js";
import { escapeHTML } from "./ui.js";

let currentPreviewRows = [];

export function getBulkElements() {
  return {
    textArea: document.getElementById("bulkText"),
    fileInput: document.getElementById("bulkFile"),
    processButton: document.getElementById("btnProcessBulk"),
    previewBox: document.getElementById("bulkPreviewBox")
  };
}

export function renderBulkPreview(rows = []) {
  const { previewBox } = getBulkElements();

  if (!previewBox) {
    return;
  }

  const summary = summarizeBulkResult(rows);

  if (!rows.length) {
    previewBox.innerHTML = `
      <p>No se detectaron registros. Pega texto, tabla o sube un archivo válido.</p>
    `;
    return;
  }

  previewBox.innerHTML = `
    <div class="bulk-preview-summary">
      <strong>Procesados: ${summary.total}</strong>
      <span>Correctos: ${summary.valid}</span>
      <span>Con errores: ${summary.invalid}</span>
    </div>

    <div class="bulk-preview-list">
      ${rows.map((row, index) => renderBulkRow(row, index)).join("")}
    </div>

    <div class="modal-actions">
      <button type="button" class="btn btn-soft" id="btnClearBulkPreview">Limpiar</button>
      <button type="button" class="btn btn-primary" id="btnConfirmBulkPreview" ${summary.valid === 0 ? "disabled" : ""}>
        Agregar registros válidos
      </button>
    </div>
  `;

  previewBox.querySelector("#btnClearBulkPreview")?.addEventListener("click", clearBulkPreview);
  previewBox.querySelector("#btnConfirmBulkPreview")?.addEventListener("click", () => {
    const validItems = getValidPreviewItems();

    window.dispatchEvent(new CustomEvent("agendaJeff:bulk-confirmed", {
      detail: {
        items: validItems
      }
    }));
  });

  previewBox.querySelectorAll("[data-bulk-field]").forEach((input) => {
    input.addEventListener("input", handlePreviewEdit);
  });
}

export function renderBulkRow(row, index) {
  const item = row.item || {};
  const errorText = row.errors?.length ? row.errors.join(" ") : "Correcto";

  return `
    <article class="bulk-preview-row ${row.valid ? "is-valid" : "is-invalid"}" data-preview-index="${index}">
      <div class="bulk-preview-grid">
        <input data-bulk-field="title" data-index="${index}" value="${escapeHTML(item.title)}" placeholder="Título" />
        <input data-bulk-field="date" data-index="${index}" value="${escapeHTML(item.date)}" placeholder="AAAA-MM-DD" />
        <input data-bulk-field="time" data-index="${index}" value="${escapeHTML(item.time)}" placeholder="HH:MM" />
        <select data-bulk-field="type" data-index="${index}">
          <option value="evento" ${item.type === "evento" ? "selected" : ""}>Evento</option>
          <option value="pendiente" ${item.type === "pendiente" ? "selected" : ""}>Pendiente</option>
        </select>
        <input data-bulk-field="tag" data-index="${index}" value="${escapeHTML(item.tag)}" placeholder="Etiqueta" />
        <input data-bulk-field="description" data-index="${index}" value="${escapeHTML(item.description)}" placeholder="Descripción" />
      </div>
      <p class="bulk-preview-error">${escapeHTML(errorText)}</p>
    </article>
  `;
}

export function handlePreviewEdit(event) {
  const index = Number(event.target.dataset.index);
  const field = event.target.dataset.bulkField;

  if (!Number.isInteger(index) || !field || !currentPreviewRows[index]) {
    return;
  }

  const row = currentPreviewRows[index];
  const updatedRaw = {
    ...row.item,
    [field]: event.target.value
  };

  const { item, validation } = buildAgendaItem(updatedRaw);

  currentPreviewRows[index] = {
    ...row,
    item,
    valid: validation.ok,
    errors: validation.errors
  };

  renderBulkPreview(currentPreviewRows);
}

export function clearBulkPreview() {
  const { textArea, fileInput, previewBox } = getBulkElements();

  currentPreviewRows = [];

  if (textArea) {
    textArea.value = "";
  }

  if (fileInput) {
    fileInput.value = "";
  }

  if (previewBox) {
    previewBox.innerHTML = `<p>La vista previa aparecerá aquí cuando se procese la información.</p>`;
  }
}

export function getValidPreviewItems() {
  return currentPreviewRows
    .filter((row) => row.valid)
    .map((row) => row.item);
}

export async function processBulkInput() {
  const { textArea, fileInput, previewBox } = getBulkElements();

  if (!previewBox) {
    return;
  }

  previewBox.innerHTML = `<p>Procesando información...</p>`;

  try {
    const text = textArea?.value || "";
    const file = fileInput?.files?.[0] || null;

    let rows = [];

    if (file) {
      rows = await parseFileToItems(file);
    } else {
      rows = parseTextToItems(text);
    }

    currentPreviewRows = rows;
    renderBulkPreview(currentPreviewRows);
  } catch (error) {
    previewBox.innerHTML = `
      <p>No se pudo procesar la carga.</p>
      <p>${escapeHTML(error.message || "Error desconocido.")}</p>
    `;
  }
}

export function initBulkPreview() {
  const { processButton } = getBulkElements();

  processButton?.addEventListener("click", processBulkInput);
}