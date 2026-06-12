/*
=========================================================
Nombre completo: app.js
Ruta o ubicación: /src/js/app.js

Función o funciones:
1. Iniciar AgendaJeff.
2. Conectar UI, guardado local, Firebase, carga masiva y plataformas.
3. Guardar primero local y luego sincronizar automáticamente.
4. Guardar correctamente eventos importados por carga masiva.
5. Evitar que eventos duplicados se guarden o se envíen a plataformas.
6. Cargar eventos locales al abrir la app.
7. Probar conexiones desde el popup.
8. Completar eventos o pendientes.
9. Mantener la edición de tabla si existe event-editor.js.

Con qué se conecta:
- renderer.html
- src/js/state.js
- src/js/ui.js
- src/js/events.js
- src/js/bulk-preview.js
- src/js/sync-service.js
- src/js/platform-service.js
- src/js/duplicate-service.js
- src/js/event-editor.js, si existe

Para qué sirve:
Sirve como controlador principal definitivo de AgendaJeff.
=========================================================
*/

import {
  agendaState,
  setActiveFilter
} from "./state.js";

import {
  closeAllModals,
  closeModal,
  initUICache,
  openModal,
  renderAgendaView
} from "./ui.js";

import {
  buildAgendaItem,
  completeAgendaItem
} from "./events.js";

import { initBulkPreview } from "./bulk-preview.js";

import {
  cleanAllDuplicates,
  initSyncService,
  saveItemLocalFirst,
  saveManyItemsLocalFirst,
  syncNow
} from "./sync-service.js";

import {
  initPlatformService,
  loadPlatformConnections,
  saveSinglePlatformConnection,
  syncItemToConnectedPlatforms,
  testPlatformConnection
} from "./platform-service.js";

const DOM = {};
let editorModule = null;

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

function safeSetValue(elementId, value) {
  const element = document.getElementById(elementId);

  if (element) {
    element.value = value ?? "";
  }
}

function safeSetChecked(elementId, checked) {
  const element = document.getElementById(elementId);

  if (element) {
    element.checked = Boolean(checked);
  }
}

function setDefaultFormValues() {
  const dateInput = document.getElementById("newDate");

  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayISO();
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
    reminderTime: document.getElementById("newReminderTime")?.value || "",
    description: document.getElementById("newDescription")?.value || "",
    source: "manual"
  };
}

function findItemById(itemId) {
  return (agendaState.items || []).find((item) => item.id === itemId) || null;
}

async function loadOptionalEditorModule() {
  try {
    editorModule = await import("./event-editor.js");
  } catch (_error) {
    editorModule = null;
  }
}

function editorAvailable() {
  return Boolean(editorModule);
}

async function syncPlatformsSafely(items = []) {
  const list = Array.isArray(items) ? items : [items];

  for (const item of list) {
    if (!item?.id || item.duplicateSkipped) {
      continue;
    }

    try {
      await syncItemToConnectedPlatforms(item);
    } catch (error) {
      console.warn("No se pudo sincronizar con plataformas externas:", item.title || item.id, error);
    }
  }

  renderAgendaView();
}

function showDuplicateMessage(totalSkipped = 0) {
  if (!totalSkipped) {
    return;
  }

  const message = totalSkipped === 1
    ? "Se omitió 1 evento repetido. La app conservó solo un registro."
    : `Se omitieron ${totalSkipped} eventos repetidos. La app conservó solo un registro por evento.`;

  console.info(message);
}

async function handleNewItemSubmit(event) {
  event.preventDefault();

  const result = buildAgendaItem(getNewItemFormData());

  if (!result.validation.ok) {
    alert(result.validation.errors.join("\n"));
    return;
  }

  const savedItem = await saveItemLocalFirst({
    ...result.item,
    source: "manual"
  });

  renderAgendaView();

  if (savedItem.duplicateSkipped) {
    alert("Este evento ya existe con el mismo tipo, título, fecha y hora. No se guardó duplicado.");
    return;
  }

  closeModal("modalNew");

  DOM.formNewItem?.reset();
  setDefaultFormValues();

  syncPlatformsSafely([savedItem]);
}

async function handleBulkConfirmed(event) {
  const incomingItems = event.detail?.items || [];

  if (!incomingItems.length) {
    return;
  }

  const savedItems = await saveManyItemsLocalFirst(incomingItems.map((item) => ({
    ...item,
    source: item.source || "bulk"
  })));

  closeModal("modalBulk");
  renderAgendaView();

  window.dispatchEvent(new CustomEvent("agendaJeff:bulk-saved", {
    detail: {
      items: savedItems
    }
  }));

  if (!savedItems.length) {
    alert("No se guardaron eventos nuevos porque todos ya existían o estaban repetidos.");
    await cleanAllDuplicates().catch(() => {});
    renderAgendaView();
    return;
  }

  await syncPlatformsSafely(savedItems);

  syncNow().catch(() => {});
}

async function completeItem(item) {
  const completedItem = completeAgendaItem(item);
  const savedItem = await saveItemLocalFirst(completedItem);

  renderAgendaView();
  syncNow().catch(() => {});

  return savedItem;
}

function handleStartEdit(item) {
  if (!editorAvailable()) {
    alert("El módulo de edición no está disponible.");
    return;
  }

  if (typeof editorModule.startEditingItem === "function") {
    editorModule.startEditingItem(item);
    renderAgendaView();
  }
}

function handleCancelEdit(itemId) {
  if (!editorAvailable()) {
    return;
  }

  if (typeof editorModule.cancelEditingItem === "function") {
    editorModule.cancelEditingItem(itemId);
    renderAgendaView();
  }
}

function handleCancelAllEdits() {
  if (!editorAvailable()) {
    return;
  }

  if (typeof editorModule.cancelAllEditing === "function") {
    editorModule.cancelAllEditing();
    renderAgendaView();
  }
}

async function handleSaveEditedItem(item) {
  if (!editorAvailable()) {
    alert("El módulo de edición no está disponible.");
    return;
  }

  if (typeof editorModule.buildUpdatedItemFromDraft !== "function") {
    alert("La edición no tiene constructor de borradores disponible.");
    return;
  }

  const result = editorModule.buildUpdatedItemFromDraft(item);

  if (!result.validation.ok) {
    renderAgendaView();
    alert(result.validation.errors.join("\n"));
    return;
  }

  const savedItem = await saveItemLocalFirst(result.item);

  if (savedItem.duplicateSkipped) {
    alert("No se guardó la edición porque dejaría un evento duplicado.");
    renderAgendaView();
    return;
  }

  if (typeof editorModule.cancelEditingItem === "function") {
    editorModule.cancelEditingItem(item.id);
  }

  renderAgendaView();
  syncNow().catch(() => {});

  return savedItem;
}

async function handleSaveAllEdits() {
  if (!editorAvailable()) {
    return;
  }

  if (typeof editorModule.getValidatedChangedItems !== "function") {
    alert("La edición masiva no está disponible.");
    return;
  }

  const result = editorModule.getValidatedChangedItems(agendaState.items || []);

  if (!result.ok) {
    const message = result.errors.map((error) => {
      return `${error.item?.title || "Registro sin título"}: ${error.errors.join(" ")}`;
    }).join("\n");

    renderAgendaView();
    alert(message || "Hay filas con errores.");

    return;
  }

  if (!result.items.length) {
    handleCancelAllEdits();
    return;
  }

  const savedItems = await saveManyItemsLocalFirst(result.items);

  if (typeof editorModule.cancelAllEditing === "function") {
    editorModule.cancelAllEditing();
  }

  if (savedItems.length < result.items.length) {
    alert("Algunas ediciones no se guardaron porque generaban duplicados.");
  }

  renderAgendaView();
  syncNow().catch(() => {});
}

async function handleListClick(event) {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const itemId = button.dataset.id;

  if (action === "save-all-edits") {
    await handleSaveAllEdits();
    return;
  }

  if (action === "cancel-all-edits") {
    handleCancelAllEdits();
    return;
  }

  if (action === "clean-duplicates") {
    const result = await cleanAllDuplicates();
    renderAgendaView();

    const localStats = result.local?.stats || {};
    const totalDeleted = Number(localStats.deleted || 0);

    alert(totalDeleted > 0
      ? `Listo. Se eliminaron ${totalDeleted} duplicados locales. También se intentó limpiar Firebase.`
      : "Listo. No se encontraron duplicados locales."
    );

    return;
  }

  const item = findItemById(itemId);

  if (!item && itemId) {
    return;
  }

  if (action === "complete") {
    await completeItem(item);
    return;
  }

  if (action === "edit") {
    handleStartEdit(item);
    return;
  }

  if (action === "cancel-edit") {
    handleCancelEdit(itemId);
    return;
  }

  if (action === "save-edit") {
    await handleSaveEditedItem(item);
  }
}

function handleListInput(event) {
  const field = event.target?.dataset?.editField;
  const itemId = event.target?.dataset?.id;

  if (!field || !itemId || !editorAvailable()) {
    return;
  }

  if (typeof editorModule.updateDraftField === "function") {
    editorModule.updateDraftField(itemId, field, event.target.value);

    const row = event.target.closest(".editable-row");

    if (row) {
      row.classList.add("is-dirty");
    }
  }
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
    element.textContent = message || "Conectado";
    return;
  }

  if (status === "checking") {
    element.classList.add("is-checking");
    element.textContent = message || "Probando";
    return;
  }

  element.classList.add("is-offline");
  element.textContent = message || "Desconectado";
}

function updateConnectionTextsFromLoadedData() {
  const connections = agendaState.connections || {};

  updateConnectionText("telegram", connections.telegram?.enabled ? "online" : "offline");
  updateConnectionText("google", connections.google?.enabled ? "online" : "offline");
  updateConnectionText("microsoft", connections.microsoft?.enabled ? "online" : "offline");
  updateConnectionText("desktop", connections.desktop?.enabled !== false ? "online" : "offline");
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

  updateConnectionText(platformName, savedConfig.enabled ? "online" : "offline", "Guardado");
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
  DOM.btnOpenNew?.addEventListener("click", () => openModal("modalNew"));
  DOM.btnOpenBulk?.addEventListener("click", () => openModal("modalBulk"));

  DOM.btnOpenConnections?.addEventListener("click", () => {
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

  DOM.formNewItem?.addEventListener("submit", handleNewItemSubmit);
  DOM.eventList?.addEventListener("click", handleListClick);
  DOM.eventList?.addEventListener("input", handleListInput);
  DOM.eventList?.addEventListener("change", handleListInput);

  DOM.savePlatformButtons.forEach((button) => {
    button.addEventListener("click", handleSavePlatform);
  });

  DOM.testPlatformButtons.forEach((button) => {
    button.addEventListener("click", handleTestPlatform);
  });

  window.addEventListener("agendaJeff:bulk-confirmed", handleBulkConfirmed);
  window.addEventListener("agendaJeff:synced", renderAgendaView);
  window.addEventListener("agendaJeff:offline", renderAgendaView);
  window.addEventListener("agendaJeff:local-saved", renderAgendaView);
  window.addEventListener("agendaJeff:local-saved-many", (event) => {
    const stats = event.detail?.duplicateStats;

    if (stats?.skipped) {
      showDuplicateMessage(stats.skipped);
    }

    renderAgendaView();
  });

  window.addEventListener("agendaJeff:duplicates-skipped", (event) => {
    const skipped = event.detail?.stats?.skipped || 0;

    showDuplicateMessage(skipped);
  });
}

async function initApp() {
  cacheDOM();
  initUICache();
  initBulkPreview();
  setDefaultFormValues();
  setActiveFilter("hoy");
  bindEvents();

  renderAgendaView();

  await loadOptionalEditorModule();
  await loadAppInfo();

  await initSyncService();
  await cleanAllDuplicates().catch((error) => {
    console.warn("No se pudo limpiar duplicados al iniciar.", error);
  });

  renderAgendaView();

  await initPlatformService();

  fillPlatformForms();
  updateConnectionTextsFromLoadedData();
  renderAgendaView();
}

initApp().catch((error) => {
  console.error(error);
  alert(error.message || "No se pudo iniciar AgendaJeff.");
});