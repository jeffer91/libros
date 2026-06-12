/*
=========================================================
Nombre completo: ui.js
Ruta o ubicación: /src/js/ui.js

Función o funciones:
1. Renderizar lista compacta de eventos y pendientes.
2. Renderizar contadores principales.
3. Renderizar filtros activos.
4. Mostrar estado de plataformas conectadas.
5. Abrir y cerrar modales.
6. Delegar la lista principal a una tabla editable compacta.

Con qué se conecta:
- renderer.html
- src/js/state.js
- src/js/filters.js
- src/js/editable-events-table.js
- src/css/components.css
- src/css/editable-table.css
- src/css/modals.css

Para qué sirve:
Sirve para separar la parte visual de la lógica principal de la app.
=========================================================
*/

import { agendaState } from "./state.js";
import { applyMainFilter, getFilterMetadata, getMainCounters } from "./filters.js";
import { renderEditableEventsTable } from "./editable-events-table.js";

const uiCache = {};

export function initUICache() {
  uiCache.eventList = document.getElementById("eventList");
  uiCache.listTitle = document.getElementById("listTitle");
  uiCache.listDescription = document.getElementById("listDescription");

  uiCache.countToday = document.getElementById("countToday");
  uiCache.countUpcoming = document.getElementById("countUpcoming");
  uiCache.countTasks = document.getElementById("countTasks");
  uiCache.countPast = document.getElementById("countPast");

  uiCache.syncStatus = document.getElementById("syncStatus");

  uiCache.filterButtons = Array.from(document.querySelectorAll(".filter-chip"));

  uiCache.dotTelegram = document.getElementById("dotTelegram");
  uiCache.dotGoogle = document.getElementById("dotGoogle");
  uiCache.dotMicrosoft = document.getElementById("dotMicrosoft");
  uiCache.dotDesktop = document.getElementById("dotDesktop");
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

export function closeAllModals() {
  ["modalNew", "modalBulk", "modalConnections"].forEach(closeModal);
}

export function formatDateTimeLabel(item) {
  if (!item.date && !item.time) {
    return "Sin fecha";
  }

  if (item.date && !item.time) {
    return item.date;
  }

  if (!item.date && item.time) {
    return item.time;
  }

  return `${item.date} ${item.time}`;
}

export function getStatusView(status) {
  const normalized = String(status || "activo").toLowerCase();

  if (normalized === "completado") {
    return {
      label: "Completado",
      className: "is-completed"
    };
  }

  if (normalized === "pasado") {
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

export function renderEmptyState(message = "Usa el botón “+ Nuevo” o “Carga masiva” para agregar eventos y pendientes.") {
  if (!uiCache.eventList) {
    return;
  }

  uiCache.eventList.innerHTML = `
    <div class="empty-state">
      <h3>No hay registros para mostrar</h3>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}

export function renderList(items = []) {
  if (!uiCache.eventList) {
    return;
  }

  if (!items.length) {
    renderEmptyState();
    return;
  }

  uiCache.eventList.innerHTML = renderEditableEventsTable(items);
}

export function renderCounters(items = []) {
  const counters = getMainCounters(items);

  if (uiCache.countToday) {
    uiCache.countToday.textContent = counters.today;
  }

  if (uiCache.countUpcoming) {
    uiCache.countUpcoming.textContent = counters.upcoming;
  }

  if (uiCache.countTasks) {
    uiCache.countTasks.textContent = counters.tasks;
  }

  if (uiCache.countPast) {
    uiCache.countPast.textContent = counters.past;
  }
}

export function renderFilters(activeFilter = "hoy") {
  const metadata = getFilterMetadata(activeFilter);

  if (uiCache.listTitle) {
    uiCache.listTitle.textContent = metadata.title;
  }

  if (uiCache.listDescription) {
    uiCache.listDescription.textContent = metadata.description;
  }

  if (Array.isArray(uiCache.filterButtons)) {
    uiCache.filterButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filter === activeFilter);
    });
  }
}

export function renderPlatformDots(platforms = {}) {
  const map = {
    telegram: uiCache.dotTelegram,
    google: uiCache.dotGoogle,
    microsoft: uiCache.dotMicrosoft,
    desktop: uiCache.dotDesktop
  };

  Object.entries(map).forEach(([platformName, element]) => {
    if (!element) {
      return;
    }

    const status = platforms[platformName] || "offline";

    element.classList.remove("is-online", "is-offline", "is-checking");

    if (status === "online") {
      element.classList.add("is-online");
    } else if (status === "checking") {
      element.classList.add("is-checking");
    } else {
      element.classList.add("is-offline");
    }
  });
}

export function renderSyncStatus(sync = {}) {
  if (!uiCache.syncStatus) {
    return;
  }

  if (!sync.online) {
    uiCache.syncStatus.textContent = "Sin internet · guardando local";
    uiCache.syncStatus.style.color = "var(--warning)";
    uiCache.syncStatus.style.background = "var(--warning-soft)";
    return;
  }

  if (sync.pendingCount > 0) {
    uiCache.syncStatus.textContent = `${sync.pendingCount} pendiente(s) por sincronizar`;
    uiCache.syncStatus.style.color = "var(--warning)";
    uiCache.syncStatus.style.background = "var(--warning-soft)";
    return;
  }

  uiCache.syncStatus.textContent = "Sincronización automática";
  uiCache.syncStatus.style.color = "var(--success)";
  uiCache.syncStatus.style.background = "var(--success-soft)";
}

export function renderAgendaView() {
  const filteredItems = applyMainFilter(agendaState.items, agendaState.activeFilter);

  renderCounters(agendaState.items);
  renderFilters(agendaState.activeFilter);
  renderPlatformDots(agendaState.platforms);
  renderSyncStatus(agendaState.sync);
  renderList(filteredItems);
}