/*
=========================================================
Nombre completo: app.js
Ruta o ubicación: /src/js/app.js

Función o funciones:
1. Iniciar AgendaJeff.
2. Conectar UI, guardado local, Firebase, carga masiva y plataformas.
3. Guardar primero local y luego sincronizar automáticamente.
4. Cargar credenciales reales desde Firebase.
5. Probar conexiones desde el popup.
6. Completar eventos o pendientes.
7. Editar eventos en tabla compacta sin crear duplicados.
8. Guardar una fila o todos los cambios pendientes de edición.

Con qué se conecta:
- renderer.html
- src/js/state.js
- src/js/ui.js
- src/js/events.js
- src/js/bulk-preview.js
- src/js/sync-service.js
- src/js/platform-service.js
- src/js/event-editor.js

Para qué sirve:
Sirve como controlador principal definitivo de AgendaJeff.
=========================================================
*/

import {
  agendaState,
  setActiveFilter
} from "./state.js";

import {
  initUICache,
  renderAgendaView,
  openModal,
  closeModal,
  closeAllModals
} from "./ui.js";

import {
  buildAgendaItem,
  completeAgendaItem
} from "./events.js";

import {
  initBulkPreview
} from "./bulk-preview.js";

import {
  initSyncService,
  saveItemLocalFirst,
  saveManyItemsLocalFirst
} from "./sync-service.js";

import {
  initPlatformService,
  loadPlatformConnections,
  saveSinglePlatformConnection,
  testPlatformConnection,
  syncItemToConnectedPlatforms
} from "./platform-service.js";

import {
  buildEditedAgendaItem,
  cancelAllEditing,
  cancelEditingItem,
  findItemById,
  finishEditingItem,
  formatEditorErrors,
  getDirtyItemIds,
  getEditedItemsReadyToSave,
  hasDraftChanges,
  isItemBeingEdited,
  setDraftField,
  startEditingItem
} from "./event-editor.js";

const DOM = {};

function cacheDOM() {
  DOM.appSubtitle = document.getElementById("appSubtitle");

  DOM.btnOpenNew = document.getElementById("btnOpenNew");
  DOM.btnOpenBulk = document.getElementById("btnOpenBulk");
  DOM.btnOpenConnections = document.getElementById("btnOpenConnections");

  DOM.formNewItem = document.getElementById("formNewItem");
  DOM.eventList = document.getElementById("eventList");

  DOM.filterButtons = Array.from(document.querySelectorAll(".filter-chip"));
  DOM.closeModalButtons = Array.from(document.querySelectorAll("[data-close-modal]"));

  DOM.savePlatformButtons = Array.from(document.querySelectorAll("[data-save-platform]"));
  DOM.testPlatformButtons = Array.from(document.querySelectorAll("[data-test-platform]"));
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultFormValues() {
  const dateInput = document.getElementById("newDate");

  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayISO();
  }
}

function safeSetValue(elementId, value) {
  const element = document.getElementById(elementId);

  if (element) {
    element.value = value;
  }
}

function safeSetChecked(elementId, checked) {
  const element = document.getElementById(elementId);

  if (element) {
    element.checked = Boolean(checked);
  }
}

function getNewItemFormData() {
  return {
    type: document.getElementById("newType")?.value || "evento",
    title: document.getElementById("newTitle")?.value || "",
    date: document.getElementById("newDate")?.value || "",
    time: document.getElementById("newTime")?.value || "",
    tag: document.getElementById("newTag")?.value || "Trabajo",
    reminder: document.getElementById("newReminder")?.value || "mismo_dia",
    description: document.getElementById("newDescription")?.value || "",
    source: "manual"
  };
}

function getItemById(itemId) {
  return findItemById(agendaState.items, itemId);
}

async function handleNewItemSubmit(event) {
  event.preventDefault();

  const { item, validation } = buildAgendaItem(getNewItemFormData());

  if (!validation.ok) {
    alert(validation.errors.join("\n"));
    return;
  }

  const savedItem = await saveItemLocalFirst(item);

  renderAgendaView();

  closeModal("modalNew");
  DOM.formNewItem.reset();
  setDefaultFormValues();

  syncItemToConnectedPlatforms(savedItem)
    .then(() => renderAgendaView())
    .catch(() => renderAgendaView());
}

async function handleBulkConfirmed(event) {
  const items = event.detail?.items || [];

  if (!items.length) {
    return;
  }

  const savedItems = await saveManyItemsLocalFirst(items);

  closeModal("modalBulk");
  renderAgendaView();

  for (const item of savedItems) {
    syncItemToConnectedPlatforms(item).catch(() => {});
  }
}

function refreshEditorToolbarOnly() {
  const toolbar = DOM.eventList?.querySelector(".editable-table-toolbar");

  if (!toolbar) {
    return;
  }

  const editingCount = DOM.eventList.querySelectorAll(".editable-row.is-editing").length;
  const dirtyCount = getDirtyItemIds(agendaState.items).length;
  const hint = toolbar.querySelector(".editable-table-hint");
  const saveAllButton = toolbar.querySelector("[data-action='save-all-edits']");

  if (hint) {
    hint.textContent = `${editingCount} fila(s) en edición · ${dirtyCount} cambio(s) sin guardar`;
  }

  if (saveAllButton) {
    saveAllButton.disabled = dirtyCount === 0;
  }
}

function updateRowDirtyVisual(itemId) {
  if (!DOM.eventList) {
    return;
  }

  const row = Array.from(DOM.eventList.querySelectorAll(".editable-row")).find((element) => {
    return element.dataset.id === itemId;
  });

  const originalItem = getItemById(itemId);

  if (!row || !originalItem) {
    return;
  }

  row.classList.toggle("is-dirty", hasDraftChanges(itemId, originalItem));
  refreshEditorToolbarOnly();
}

async function saveEditedItem(itemId) {
  const originalItem = getItemById(itemId);

  if (!originalItem) {
    alert("No se encontró el evento para guardar.");
    return;
  }

  const result = buildEditedAgendaItem(originalItem);

  if (!result.ok) {
    alert(result.errors.join("\n"));
    renderAgendaView();
    return;
  }

  await saveItemLocalFirst(result.item);
  finishEditingItem(itemId);
  renderAgendaView();
}

async function saveAllEditedItems() {
  const result = getEditedItemsReadyToSave(agendaState.items);

  if (!result.ok) {
    alert(formatEditorErrors(result.errors));
    renderAgendaView();
    return;
  }

  if (!result.ready.length) {
    cancelAllEditing();
    renderAgendaView();
    return;
  }

  await saveManyItemsLocalFirst(result.ready);

  result.ready.forEach((item) => {
    finishEditingItem(item.id);
  });

  renderAgendaView();
}

async function completeItem(itemId) {
  const item = getItemById(itemId);

  if (!item) {
    return;
  }

  const completed = completeAgendaItem(item);
  const savedItem = await saveItemLocalFirst(completed);

  const index = agendaState.items.findIndex((record) => {
    return record.id === itemId;
  });

  if (index >= 0) {
    agendaState.items[index] = savedItem;
  }

  if (isItemBeingEdited(itemId)) {
    finishEditingItem(itemId);
  }

  renderAgendaView();
}

async function handleListClick(event) {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const itemId = button.dataset.id;

  if (action === "save-all-edits") {
    await saveAllEditedItems();
    return;
  }

  if (action === "cancel-all-edits") {
    cancelAllEditing();
    renderAgendaView();
    return;
  }

  if (!itemId) {
    return;
  }

  const item = getItemById(itemId);

  if (!item) {
    return;
  }

  if (action === "complete") {
    await completeItem(itemId);
    return;
  }

  if (action === "edit") {
    startEditingItem(item);
    renderAgendaView();
    return;
  }

  if (action === "cancel-edit") {
    cancelEditingItem(itemId);
    renderAgendaView();
    return;
  }

  if (action === "save-edit") {
    await saveEditedItem(itemId);
  }
}

function handleListInput(event) {
  const field = event.target.closest("[data-editor-field]");

  if (!field) {
    return;
  }

  const itemId = field.dataset.id;
  const fieldName = field.dataset.editorField;

  setDraftField(itemId, fieldName, field.value);
  updateRowDirtyVisual(itemId);
}

function getPlatformFormData(platformName) {
  if (platformName === "telegram") {
    return {
      enabled: document.getElementById("telegramEnabled")?.checked || false,
      botToken: document.getElementById("telegramBotToken")?.value || "",
      chatId: document.getElementById("telegramChatId")?.value || ""
    };
  }

  if (platformName === "google") {
    return {
      enabled: document.getElementById("googleEnabled")?.checked || false,
      clientId: document.getElementById("googleClientId")?.value || "",
      clientSecret: document.getElementById("googleClientSecret")?.value || "",
      refreshToken: document.getElementById("googleRefreshToken")?.value || "",
      calendarId: document.getElementById("googleCalendarId")?.value || "primary"
    };
  }

  if (platformName === "microsoft") {
    return {
      enabled: document.getElementById("microsoftEnabled")?.checked || false,
      tenantId: document.getElementById("microsoftTenantId")?.value || "common",
      clientId: document.getElementById("microsoftClientId")?.value || "",
      clientSecret: document.getElementById("microsoftClientSecret")?.value || "",
      refreshToken: document.getElementById("microsoftRefreshToken")?.value || "",
      userPrincipalName: document.getElementById("microsoftUserPrincipalName")?.value || ""
    };
  }

  if (platformName === "desktop") {
    return {
      enabled: document.getElementById("desktopEnabled")?.checked ?? true
    };
  }

  return {};
}

function fillPlatformForms() {
  const connections = agendaState.connections || {};

  const telegram = connections.telegram || {};
  const google = connections.google || {};
  const microsoft = connections.microsoft || {};
  const desktop = connections.desktop || {};

  safeSetChecked("telegramEnabled", telegram.enabled);
  safeSetValue("telegramBotToken", telegram.botToken || "");
  safeSetValue("telegramChatId", telegram.chatId || "");

  safeSetChecked("googleEnabled", google.enabled);
  safeSetValue("googleClientId", google.clientId || "");
  safeSetValue("googleClientSecret", google.clientSecret || "");
  safeSetValue("googleRefreshToken", google.refreshToken || "");
  safeSetValue("googleCalendarId", google.calendarId || "primary");

  safeSetChecked("microsoftEnabled", microsoft.enabled);
  safeSetValue("microsoftTenantId", microsoft.tenantId || "common");
  safeSetValue("microsoftClientId", microsoft.clientId || "");
  safeSetValue("microsoftClientSecret", microsoft.clientSecret || "");
  safeSetValue("microsoftRefreshToken", microsoft.refreshToken || "");
  safeSetValue("microsoftUserPrincipalName", microsoft.userPrincipalName || "");

  safeSetChecked("desktopEnabled", desktop.enabled !== false);
}

function updateConnectionText(platformName, status, message = "") {
  const map = {
    telegram: document.getElementById("statusTelegramText"),
    google: document.getElementById("statusGoogleText"),
    microsoft: document.getElementById("statusMicrosoftText"),
    desktop: document.getElementById("statusDesktopText")
  };

  const element = map[platformName];

  if (!element) {
    return;
  }

  element.classList.remove("is-online", "is-offline", "is-checking");

  if (status === "online") {
    element.classList.add("is-online");
    element.textContent = "Conectado";
  } else if (status === "checking") {
    element.classList.add("is-checking");
    element.textContent = message || "Cargando";
  } else {
    element.classList.add("is-offline");
    element.textContent = message || "Desconectado";
  }
}

function updateConnectionTextsFromLoadedData() {
  const connections = agendaState.connections || {};

  updateConnectionText(
    "telegram",
    connections.telegram?.enabled ? "online" : "offline"
  );

  updateConnectionText(
    "google",
    connections.google?.enabled ? "online" : "offline"
  );

  updateConnectionText(
    "microsoft",
    connections.microsoft?.enabled ? "online" : "offline"
  );

  updateConnectionText(
    "desktop",
    connections.desktop?.enabled !== false ? "online" : "offline"
  );
}

async function openConnectionsModal() {
  openModal("modalConnections");

  fillPlatformForms();
  updateConnectionTextsFromLoadedData();

  updateConnectionText("telegram", "checking", "Cargando");
  updateConnectionText("google", "checking", "Cargando");
  updateConnectionText("microsoft", "checking", "Cargando");
  updateConnectionText("desktop", "checking", "Cargando");

  await loadPlatformConnections();

  fillPlatformForms();
  updateConnectionTextsFromLoadedData();
}

async function handleSavePlatform(event) {
  const button = event.currentTarget || event.target;
  const platformName = button.dataset.savePlatform;
  const config = getPlatformFormData(platformName);

  const savedConfig = await saveSinglePlatformConnection(platformName, config);

  await loadPlatformConnections();

  fillPlatformForms();
  updateConnectionTextsFromLoadedData();
  renderAgendaView();

  updateConnectionText(
    platformName,
    savedConfig.enabled ? "online" : "offline",
    "Guardado"
  );
}

async function handleTestPlatform(event) {
  const button = event.currentTarget || event.target;
  const platformName = button.dataset.testPlatform;
  const config = getPlatformFormData(platformName);

  await saveSinglePlatformConnection(platformName, config);

  updateConnectionText(platformName, "checking", "Probando");

  const result = await testPlatformConnection(platformName);

  updateConnectionText(platformName, result.ok ? "online" : "offline", result.message);
  renderAgendaView();

  if (!result.ok) {
    alert(result.message);
  }
}

async function loadAppInfo() {
  if (!window.agendaJeff?.appInfo) {
    return;
  }

  const info = await window.agendaJeff.appInfo();

  if (info?.ok && DOM.appSubtitle) {
    DOM.appSubtitle.textContent = `Agenda personal sincronizada · v${info.version}`;
  }
}

function bindEvents() {
  DOM.btnOpenNew.addEventListener("click", () => openModal("modalNew"));
  DOM.btnOpenBulk.addEventListener("click", () => openModal("modalBulk"));

  DOM.btnOpenConnections.addEventListener("click", () => {
    openConnectionsModal().catch((error) => {
      console.error(error);
      fillPlatformForms();
      updateConnectionTextsFromLoadedData();
      alert(error.message || "No se pudieron cargar las conexiones.");
    });
  });

  DOM.closeModalButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });

  DOM.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveFilter(button.dataset.filter);
      renderAgendaView();
    });
  });

  DOM.formNewItem.addEventListener("submit", handleNewItemSubmit);
  DOM.eventList.addEventListener("click", handleListClick);
  DOM.eventList.addEventListener("input", handleListInput);
  DOM.eventList.addEventListener("change", handleListInput);

  DOM.savePlatformButtons.forEach((button) => {
    button.addEventListener("click", handleSavePlatform);
  });

  DOM.testPlatformButtons.forEach((button) => {
    button.addEventListener("click", handleTestPlatform);
  });

  window.addEventListener("agendaJeff:bulk-confirmed", handleBulkConfirmed);
  window.addEventListener("agendaJeff:synced", renderAgendaView);
  window.addEventListener("agendaJeff:offline", renderAgendaView);
}

async function initApp() {
  cacheDOM();
  initUICache();
  initBulkPreview();
  setDefaultFormValues();
  setActiveFilter("hoy");
  bindEvents();

  renderAgendaView();

  await loadAppInfo();
  await initSyncService();
  await initPlatformService();

  fillPlatformForms();
  updateConnectionTextsFromLoadedData();
  renderAgendaView();
}

initApp().catch((error) => {
  console.error(error);
  alert(error.message || "No se pudo iniciar AgendaJeff.");
});