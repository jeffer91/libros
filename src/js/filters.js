/*
=========================================================
Nombre completo: filters.js
Ruta o ubicación: /src/js/filters.js

Función o funciones:
1. Aplicar filtros principales de la app.
2. Separar registros de hoy, próximos, pendientes y pasados.
3. Calcular contadores superiores.
4. Devolver textos de cada filtro.

Con qué se conecta:
- src/js/state.js
- src/js/ui.js
- src/js/events.js

Para qué sirve:
Sirve para que la lista principal sea compacta y organizada.
=========================================================
*/

import { ITEM_STATUS, ITEM_TYPES, normalizeAgendaItems } from "./events.js";

export const MAIN_FILTERS = {
  HOY: "hoy",
  TODOS: "todos",
  PROXIMOS: "proximos",
  PENDIENTES: "pendientes",
  PASADOS: "pasados"
};

export function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isTodayItem(item = {}) {
  const today = getTodayISO();

  if (item.status !== ITEM_STATUS.ACTIVO) {
    return false;
  }

  if (item.type === ITEM_TYPES.PENDIENTE && !item.date) {
    return true;
  }

  return item.date === today;
}

export function isUpcomingItem(item = {}) {
  const today = getTodayISO();

  if (item.status !== ITEM_STATUS.ACTIVO) {
    return false;
  }

  if (!item.date) {
    return false;
  }

  return item.date > today;
}

export function isPendingItem(item = {}) {
  return item.type === ITEM_TYPES.PENDIENTE && item.status === ITEM_STATUS.ACTIVO;
}

export function isPastItem(item = {}) {
  return item.status === ITEM_STATUS.PASADO || item.status === ITEM_STATUS.COMPLETADO;
}

export function sortAgendaItems(items = []) {
  return [...items].sort((a, b) => {
    const aDate = a.date || "9999-12-31";
    const bDate = b.date || "9999-12-31";
    const aTime = a.time || "23:59";
    const bTime = b.time || "23:59";

    return `${aDate} ${aTime}`.localeCompare(`${bDate} ${bTime}`);
  });
}

export function applyMainFilter(items = [], filter = MAIN_FILTERS.HOY) {
  const normalizedItems = normalizeAgendaItems(items);

  if (filter === MAIN_FILTERS.TODOS) {
    return sortAgendaItems(normalizedItems);
  }

  if (filter === MAIN_FILTERS.HOY) {
    return sortAgendaItems(normalizedItems.filter(isTodayItem));
  }

  if (filter === MAIN_FILTERS.PROXIMOS) {
    return sortAgendaItems(normalizedItems.filter(isUpcomingItem));
  }

  if (filter === MAIN_FILTERS.PENDIENTES) {
    return sortAgendaItems(normalizedItems.filter(isPendingItem));
  }

  if (filter === MAIN_FILTERS.PASADOS) {
    return sortAgendaItems(normalizedItems.filter(isPastItem));
  }

  return sortAgendaItems(normalizedItems);
}

export function getMainCounters(items = []) {
  const normalizedItems = normalizeAgendaItems(items);

  return {
    today: normalizedItems.filter(isTodayItem).length,
    upcoming: normalizedItems.filter(isUpcomingItem).length,
    tasks: normalizedItems.filter(isPendingItem).length,
    past: normalizedItems.filter(isPastItem).length
  };
}

export function getFilterMetadata(filter = MAIN_FILTERS.HOY) {
  const data = {
    [MAIN_FILTERS.HOY]: {
      title: "Hoy",
      description: "Eventos y pendientes para hoy."
    },
    [MAIN_FILTERS.TODOS]: {
      title: "Todos",
      description: "Todos los eventos y pendientes registrados."
    },
    [MAIN_FILTERS.PROXIMOS]: {
      title: "Próximos",
      description: "Eventos activos con fecha futura."
    },
    [MAIN_FILTERS.PENDIENTES]: {
      title: "Pendientes",
      description: "Pendientes activos hasta completar."
    },
    [MAIN_FILTERS.PASADOS]: {
      title: "Pasados",
      description: "Eventos pasados y completados conservados por un mes."
    }
  };

  return data[filter] || data[MAIN_FILTERS.HOY];
}