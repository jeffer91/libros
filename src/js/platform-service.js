/*
=========================================================
Nombre completo: platform-service.js
Ruta o ubicación: /src/js/platform-service.js

Función o funciones:
1. Administrar Telegram, Google Calendar, Microsoft Calendar y notificaciones de escritorio.
2. Cargar credenciales desde respaldos_datos_importantes/principal/datos.
3. Adaptar nombres reales de Firebase a nombres internos de la app.
4. Guardar conexiones localmente y en Firebase.
5. Probar conexiones y pintar íconos verde/rojo.
6. Evitar que la app quede detenida en "Probando".

Con qué se conecta:
- src/js/state.js
- src/js/local-db.js
- src/js/firebase-service.js
- src/js/telegram-service.js
- src/js/google-service.js
- src/js/microsoft-service.js
- main.js
- preload.js

Para qué sirve:
Sirve como centro de control para plataformas externas.
=========================================================
*/

import { agendaState, updatePlatformStatus } from "./state.js";
import { saveSetting, getSetting } from "./local-db.js";

import {
  getImportantData,
  updateImportantDataPatch,
  saveFirebaseConnection,
  getFirebaseConnection
} from "./firebase-service.js";

import {
  testTelegramConnection,
  sendTelegramReminder
} from "./telegram-service.js";

import {
  testGoogleCalendarConnection,
  createGoogleCalendarEvent
} from "./google-service.js";

import {
  testMicrosoftCalendarConnection,
  createMicrosoftCalendarEvent
} from "./microsoft-service.js";

const CONNECTIONS_KEY = "platformConnections";
const LOCAL_TIMEOUT_MS = 1500;
const FIREBASE_LOAD_TIMEOUT_MS = 9000;
const PLATFORM_TEST_TIMEOUT_MS = 12000;

export const PLATFORM_NAMES = {
  TELEGRAM: "telegram",
  GOOGLE: "google",
  MICROSOFT: "microsoft",
  DESKTOP: "desktop"
};

function withTimeout(promise, timeoutMs, message) {
  let timer = null;

  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    })
  ]).finally(() => {
    clearTimeout(timer);
  });
}

export function getDefaultConnections() {
  return {
    telegram: {
      enabled: false,
      botToken: "",
      chatId: "",
      lastTestAt: null,
      lastError: ""
    },
    google: {
      enabled: false,
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      accessToken: "",
      tokenExpiresAt: "",
      calendarId: "primary",
      userEmail: "",
      lastTestAt: null,
      lastError: ""
    },
    microsoft: {
      enabled: false,
      tenantId: "common",
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      accessToken: "",
      redirectUri: "",
      scopes: "Calendars.ReadWrite User.Read",
      userPrincipalName: "",
      lastTestAt: null,
      lastError: ""
    },
    desktop: {
      enabled: true,
      lastTestAt: null,
      lastError: ""
    }
  };
}

export function normalizeConnections(connections = {}) {
  const defaults = getDefaultConnections();

  return {
    telegram: {
      ...defaults.telegram,
      ...(connections.telegram || {})
    },
    google: {
      ...defaults.google,
      ...(connections.google || {})
    },
    microsoft: {
      ...defaults.microsoft,
      ...(connections.microsoft || {})
    },
    desktop: {
      ...defaults.desktop,
      ...(connections.desktop || {})
    }
  };
}

function getImportantDataPayload(data = {}) {
  if (!data || typeof data !== "object") {
    return {};
  }

  if (data.datos && typeof data.datos === "object") {
    return data.datos;
  }

  return data;
}

function cleanString(value) {
  return String(value || "").trim();
}

function hasValue(value) {
  return cleanString(value) !== "";
}

function shouldApplyRemoteConnection(platformName, config = {}) {
  if (platformName === PLATFORM_NAMES.TELEGRAM) {
    return hasValue(config.botToken) || hasValue(config.chatId);
  }

  if (platformName === PLATFORM_NAMES.GOOGLE) {
    return (
      hasValue(config.clientId) ||
      hasValue(config.clientSecret) ||
      hasValue(config.refreshToken) ||
      hasValue(config.accessToken) ||
      hasValue(config.userEmail)
    );
  }

  if (platformName === PLATFORM_NAMES.MICROSOFT) {
    return (
      hasValue(config.clientId) ||
      hasValue(config.clientSecret) ||
      hasValue(config.refreshToken) ||
      hasValue(config.accessToken) ||
      hasValue(config.userPrincipalName)
    );
  }

  return false;
}

async function getLocalConnectionsSafely() {
  try {
    return await withTimeout(
      getSetting(CONNECTIONS_KEY, null),
      LOCAL_TIMEOUT_MS,
      "La base local tardó demasiado en responder."
    );
  } catch {
    return null;
  }
}

async function saveLocalConnectionsSafely(connections) {
  try {
    await withTimeout(
      saveSetting(CONNECTIONS_KEY, connections),
      LOCAL_TIMEOUT_MS,
      "La base local tardó demasiado al guardar."
    );
  } catch {
    // No detenemos la app si el guardado local tarda.
  }
}

export function mapImportantDataToConnections(data = {}) {
  const source = getImportantDataPayload(data);
  const connections = getDefaultConnections();

  const telegramToken = cleanString(source.telegramToken);
  const telegramChatId = cleanString(source.telegramChatId);

  connections.telegram = {
    ...connections.telegram,
    enabled: Boolean(telegramToken && telegramChatId),
    botToken: telegramToken,
    chatId: telegramChatId
  };

  const googleClientId = cleanString(source.googleClientId);
  const googleClientSecret = cleanString(source.googleClientSecret);
  const googleRefreshToken = cleanString(source.googleRefreshToken);

  connections.google = {
    ...connections.google,
    enabled: Boolean(googleClientId && googleClientSecret && googleRefreshToken),
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    refreshToken: googleRefreshToken,
    accessToken: cleanString(source.googleAccessToken),
    tokenExpiresAt: cleanString(source.googleTokenExpiresAt),
    calendarId: cleanString(source.googleCalendarId) || "primary",
    userEmail: cleanString(source.googleUserEmail)
  };

  const microsoftClientId = cleanString(source.microsoftClientId);
  const microsoftRefreshToken = cleanString(source.microsoftRefreshToken);

  connections.microsoft = {
    ...connections.microsoft,
    enabled: Boolean(microsoftClientId && microsoftRefreshToken),
    tenantId: cleanString(source.microsoftTenant) || "common",
    clientId: microsoftClientId,
    clientSecret: cleanString(source.microsoftClientSecret),
    refreshToken: microsoftRefreshToken,
    accessToken: cleanString(source.microsoftAccessToken),
    redirectUri: cleanString(source.microsoftRedirectUri),
    scopes: cleanString(source.microsoftScopes) || "Calendars.ReadWrite User.Read",
    userPrincipalName: cleanString(source.microsoftUserPrincipalName)
  };

  connections.desktop = {
    ...connections.desktop,
    enabled: true
  };

  return connections;
}

export function mapConnectionToImportantData(platformName, config = {}) {
  if (platformName === PLATFORM_NAMES.TELEGRAM) {
    return {
      telegramToken: config.botToken || "",
      telegramChatId: config.chatId || ""
    };
  }

  if (platformName === PLATFORM_NAMES.GOOGLE) {
    return {
      googleClientId: config.clientId || "",
      googleClientSecret: config.clientSecret || "",
      googleRefreshToken: config.refreshToken || "",
      googleAccessToken: config.accessToken || "",
      googleTokenExpiresAt: config.tokenExpiresAt || "",
      googleCalendarId: config.calendarId || "primary",
      googleUserEmail: config.userEmail || "",
      googleScopes: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
      googleRedirectUri: "Automático en Electron"
    };
  }

  if (platformName === PLATFORM_NAMES.MICROSOFT) {
    return {
      microsoftTenant: config.tenantId || "common",
      microsoftClientId: config.clientId || "",
      microsoftClientSecret: config.clientSecret || "",
      microsoftRefreshToken: config.refreshToken || "",
      microsoftAccessToken: config.accessToken || "",
      microsoftRedirectUri: config.redirectUri || "",
      microsoftScopes: config.scopes || "Calendars.ReadWrite User.Read",
      microsoftUserPrincipalName: config.userPrincipalName || ""
    };
  }

  return {};
}

export function applyLoadedConnectionStatuses(connections = agendaState.connections) {
  const normalized = normalizeConnections(connections);

  updatePlatformStatus(
    PLATFORM_NAMES.TELEGRAM,
    normalized.telegram.enabled ? "online" : "offline"
  );

  updatePlatformStatus(
    PLATFORM_NAMES.GOOGLE,
    normalized.google.enabled ? "online" : "offline"
  );

  updatePlatformStatus(
    PLATFORM_NAMES.MICROSOFT,
    normalized.microsoft.enabled ? "online" : "offline"
  );

  updatePlatformStatus(
    PLATFORM_NAMES.DESKTOP,
    normalized.desktop.enabled !== false ? "online" : "offline"
  );
}

export async function loadPlatformConnections() {
  const defaults = getDefaultConnections();
  const localConnections = await getLocalConnectionsSafely();

  let merged = normalizeConnections({
    ...defaults,
    ...(localConnections || {})
  });

  try {
    const importantData = await withTimeout(
      getImportantData(),
      FIREBASE_LOAD_TIMEOUT_MS,
      "Firebase tardó demasiado en cargar las conexiones."
    );

    const firebaseConnections = mapImportantDataToConnections(importantData);

    merged = normalizeConnections({
      telegram: shouldApplyRemoteConnection(PLATFORM_NAMES.TELEGRAM, firebaseConnections.telegram)
        ? {
            ...merged.telegram,
            ...firebaseConnections.telegram
          }
        : merged.telegram,

      google: shouldApplyRemoteConnection(PLATFORM_NAMES.GOOGLE, firebaseConnections.google)
        ? {
            ...merged.google,
            ...firebaseConnections.google
          }
        : merged.google,

      microsoft: shouldApplyRemoteConnection(PLATFORM_NAMES.MICROSOFT, firebaseConnections.microsoft)
        ? {
            ...merged.microsoft,
            ...firebaseConnections.microsoft
          }
        : merged.microsoft,

      desktop: {
        ...merged.desktop,
        ...firebaseConnections.desktop
      }
    });
  } catch (error) {
    console.warn("No se pudieron cargar conexiones desde Firebase:", error.message || error);
  }

  agendaState.connections = merged;
  await saveLocalConnectionsSafely(merged);
  applyLoadedConnectionStatuses(merged);

  return merged;
}

export async function savePlatformConnections(connections = agendaState.connections) {
  const normalized = normalizeConnections(connections);

  agendaState.connections = normalized;
  await saveLocalConnectionsSafely(normalized);
  applyLoadedConnectionStatuses(normalized);

  return normalized;
}

export async function saveSinglePlatformConnection(platformName, config = {}) {
  const current = normalizeConnections(agendaState.connections);

  if (!current[platformName]) {
    throw new Error("Plataforma no válida.");
  }

  current[platformName] = {
    ...current[platformName],
    ...config,
    lastError: ""
  };

  await savePlatformConnections(current);

  try {
    await withTimeout(
      saveFirebaseConnection(platformName, current[platformName]),
      FIREBASE_LOAD_TIMEOUT_MS,
      "Firebase tardó demasiado al guardar la conexión."
    );

    const importantPatch = mapConnectionToImportantData(platformName, current[platformName]);

    if (Object.keys(importantPatch).length > 0) {
      await withTimeout(
        updateImportantDataPatch(importantPatch),
        FIREBASE_LOAD_TIMEOUT_MS,
        "Firebase tardó demasiado al actualizar datos importantes."
      );
    }
  } catch (error) {
    current[platformName].lastError = error.message || "No se pudo guardar en Firebase.";
    await savePlatformConnections(current);
  }

  return current[platformName];
}

export async function tryLoadFirebaseConnection(platformName) {
  try {
    const remote = await withTimeout(
      getFirebaseConnection(platformName),
      FIREBASE_LOAD_TIMEOUT_MS,
      "Firebase tardó demasiado en cargar la conexión."
    );

    if (!remote) {
      return null;
    }

    const current = normalizeConnections(agendaState.connections);

    current[platformName] = {
      ...current[platformName],
      ...remote
    };

    await savePlatformConnections(current);

    return current[platformName];
  } catch {
    return null;
  }
}

export async function testDesktopNotifications() {
  if (!window.agendaJeff?.notificationStatus) {
    return {
      ok: false,
      message: "El puente de Electron no está disponible."
    };
  }

  const status = await window.agendaJeff.notificationStatus();

  if (!status?.supported) {
    return {
      ok: false,
      message: "Las notificaciones de escritorio no están soportadas."
    };
  }

  if (window.agendaJeff?.notify) {
    await window.agendaJeff.notify({
      title: "AgendaJeff",
      body: "Las notificaciones de escritorio están funcionando."
    });
  }

  return {
    ok: true,
    message: "Notificaciones de escritorio disponibles."
  };
}

export async function testPlatformConnection(platformName) {
  const connections = normalizeConnections(agendaState.connections);
  const config = connections[platformName];

  if (!config) {
    throw new Error("Plataforma no válida.");
  }

  updatePlatformStatus(platformName, "checking");

  let result;

  try {
    if (platformName === PLATFORM_NAMES.TELEGRAM) {
      result = await withTimeout(
        testTelegramConnection(config),
        PLATFORM_TEST_TIMEOUT_MS,
        "Telegram tardó demasiado en responder."
      );
    } else if (platformName === PLATFORM_NAMES.GOOGLE) {
      result = await withTimeout(
        testGoogleCalendarConnection(config),
        PLATFORM_TEST_TIMEOUT_MS,
        "Google Calendar tardó demasiado en responder."
      );
    } else if (platformName === PLATFORM_NAMES.MICROSOFT) {
      result = await withTimeout(
        testMicrosoftCalendarConnection(config),
        PLATFORM_TEST_TIMEOUT_MS,
        "Microsoft Calendar tardó demasiado en responder."
      );
    } else if (platformName === PLATFORM_NAMES.DESKTOP) {
      result = await withTimeout(
        testDesktopNotifications(),
        PLATFORM_TEST_TIMEOUT_MS,
        "Las notificaciones tardaron demasiado en responder."
      );
    } else {
      result = {
        ok: false,
        message: "Plataforma no soportada."
      };
    }
  } catch (error) {
    result = {
      ok: false,
      message: error.message || "No se pudo probar la conexión."
    };
  }

  const updatedConfig = {
    ...config,
    lastTestAt: new Date().toISOString(),
    lastError: result.ok ? "" : result.message
  };

  connections[platformName] = updatedConfig;
  await savePlatformConnections(connections);

  updatePlatformStatus(platformName, result.ok ? "online" : "offline");

  return result;
}

export async function refreshPlatformStatuses() {
  const connections = normalizeConnections(agendaState.connections);

  const platforms = [
    PLATFORM_NAMES.TELEGRAM,
    PLATFORM_NAMES.GOOGLE,
    PLATFORM_NAMES.MICROSOFT,
    PLATFORM_NAMES.DESKTOP
  ];

  for (const platformName of platforms) {
    const config = connections[platformName];

    if (!config?.enabled && platformName !== PLATFORM_NAMES.DESKTOP) {
      updatePlatformStatus(platformName, "offline");
      continue;
    }

    if (platformName === PLATFORM_NAMES.DESKTOP && !config?.enabled) {
      updatePlatformStatus(platformName, "offline");
      continue;
    }

    await testPlatformConnection(platformName);
  }

  return agendaState.platforms;
}

export async function syncItemToConnectedPlatforms(item) {
  const connections = normalizeConnections(agendaState.connections);

  const result = {
    telegram: "omitido",
    google: "omitido",
    microsoft: "omitido",
    desktop: "activo"
  };

  if (connections.telegram.enabled) {
    try {
      await sendTelegramReminder(connections.telegram, item);
      result.telegram = "enviado";
      updatePlatformStatus("telegram", "online");
    } catch (error) {
      result.telegram = `error: ${error.message}`;
      updatePlatformStatus("telegram", "offline");
    }
  }

  if (connections.google.enabled) {
    try {
      await createGoogleCalendarEvent(connections.google, item);
      result.google = "enviado";
      updatePlatformStatus("google", "online");
    } catch (error) {
      result.google = `error: ${error.message}`;
      updatePlatformStatus("google", "offline");
    }
  }

  if (connections.microsoft.enabled) {
    try {
      await createMicrosoftCalendarEvent(connections.microsoft, item);
      result.microsoft = "enviado";
      updatePlatformStatus("microsoft", "online");
    } catch (error) {
      result.microsoft = `error: ${error.message}`;
      updatePlatformStatus("microsoft", "offline");
    }
  }

  if (connections.desktop.enabled) {
    updatePlatformStatus("desktop", "online");
  }

  return result;
}

export async function initPlatformService() {
  await loadPlatformConnections();

  return {
    ok: true,
    connections: agendaState.connections,
    platforms: agendaState.platforms
  };
}