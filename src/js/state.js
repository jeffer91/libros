/*
=========================================================
Nombre completo: state.js
Ruta o ubicación: /src/js/state.js

Función o funciones:
1. Mantener estado central de eventos, filtros y conexiones.
2. Guardar plataformas y configuraciones activas.
3. Controlar estado visual online/offline/checking.
4. Mantener datos base de etiquetas y recordatorios.

Con qué se conecta:
- src/js/app.js
- src/js/ui.js
- src/js/platform-service.js
- src/js/sync-service.js

Para qué sirve:
Sirve como memoria central de AgendaJeff.
=========================================================
*/

export const agendaState = {
  activeFilter: "hoy",

  items: [],

  platforms: {
    telegram: "offline",
    google: "offline",
    microsoft: "offline",
    desktop: "checking"
  },

  connections: {
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
      calendarId: "primary",
      lastTestAt: null,
      lastError: ""
    },
    microsoft: {
      enabled: false,
      tenantId: "common",
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      userPrincipalName: "",
      lastTestAt: null,
      lastError: ""
    },
    desktop: {
      enabled: true,
      lastTestAt: null,
      lastError: ""
    }
  },

  sync: {
    mode: "automatico",
    online: navigator.onLine,
    pendingCount: 0,
    lastSyncAt: null
  },

  tags: [
    "Trabajo",
    "Personal",
    "Titulación",
    "Reunión",
    "Urgente",
    "Pago",
    "Académico"
  ],

  reminderCategories: [
    {
      id: "mismo_dia",
      label: "Mismo día",
      description: "Recordar durante el mismo día del evento."
    },
    {
      id: "tres_dias_antes",
      label: "3 días antes",
      description: "Recordar tres días antes de la fecha."
    },
    {
      id: "cinco_dias_antes",
      label: "5 días antes",
      description: "Recordar cinco días antes de la fecha."
    },
    {
      id: "hasta_completar",
      label: "Hasta que se complete",
      description: "Recordar mientras el pendiente siga activo."
    }
  ]
};

export function setActiveFilter(filterName) {
  const allowedFilters = ["hoy", "todos", "proximos", "pendientes", "pasados"];

  if (!allowedFilters.includes(filterName)) {
    agendaState.activeFilter = "hoy";
    return;
  }

  agendaState.activeFilter = filterName;
}

export function updatePlatformStatus(platformName, status) {
  const allowedPlatforms = ["telegram", "google", "microsoft", "desktop"];
  const allowedStatuses = ["online", "offline", "checking"];

  if (!allowedPlatforms.includes(platformName)) {
    return;
  }

  agendaState.platforms[platformName] = allowedStatuses.includes(status)
    ? status
    : "offline";
}

export function setNetworkStatus(isOnline) {
  agendaState.sync.online = Boolean(isOnline);
}

export function setLastSyncNow() {
  agendaState.sync.lastSyncAt = new Date().toISOString();
}

export function setConnectionConfig(platformName, config = {}) {
  if (!agendaState.connections[platformName]) {
    return;
  }

  agendaState.connections[platformName] = {
    ...agendaState.connections[platformName],
    ...config
  };
}

export function replaceItems(items = []) {
  agendaState.items = Array.isArray(items) ? items : [];
}

export function upsertItemInState(item) {
  const index = agendaState.items.findIndex((record) => {
    return record.id === item.id;
  });

  if (index >= 0) {
    agendaState.items[index] = item;
  } else {
    agendaState.items.unshift(item);
  }
}

export function removeItemFromState(itemId) {
  agendaState.items = agendaState.items.filter((item) => {
    return item.id !== itemId;
  });
}