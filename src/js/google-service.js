/*
=========================================================
Nombre completo: google-service.js
Ruta o ubicación: /src/js/google-service.js

Función o funciones:
1. Obtener token de acceso de Google usando refresh token.
2. Probar conexión con Google Calendar.
3. Crear eventos en Google Calendar.
4. Manejar errores de credenciales incompletas.

Con qué se conecta:
- src/js/platform-service.js
- src/js/events.js
- Google OAuth
- Google Calendar API

Para qué sirve:
Sirve para sincronizar eventos de AgendaJeff con Google Calendar.
=========================================================
*/

import { ITEM_TYPES } from "./events.js";

export function validateGoogleConfig(config = {}) {
  const errors = [];

  if (!String(config.clientId || "").trim()) {
    errors.push("Falta Client ID de Google.");
  }

  if (!String(config.clientSecret || "").trim()) {
    errors.push("Falta Client Secret de Google.");
  }

  if (!String(config.refreshToken || "").trim()) {
    errors.push("Falta Refresh Token de Google.");
  }

  if (!String(config.calendarId || "").trim()) {
    errors.push("Falta Calendar ID de Google.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export async function getGoogleAccessToken(config = {}) {
  const validation = validateGoogleConfig(config);

  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "No se pudo obtener token de Google.");
  }

  return data.access_token;
}

export async function googleCalendarRequest(config, endpoint, options = {}) {
  const accessToken = await getGoogleAccessToken(config);

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || "Error en Google Calendar.");
  }

  return data;
}

export async function testGoogleCalendarConnection(config = {}) {
  const validation = validateGoogleConfig(config);

  if (!validation.ok) {
    return {
      ok: false,
      message: validation.errors.join(" ")
    };
  }

  try {
    const calendarId = encodeURIComponent(config.calendarId || "primary");
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}`;

    const calendar = await googleCalendarRequest(config, endpoint, {
      method: "GET"
    });

    return {
      ok: true,
      message: `Google Calendar conectado: ${calendar.summary || config.calendarId}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "No se pudo conectar con Google Calendar."
    };
  }
}

export function buildGoogleCalendarPayload(item = {}) {
  const titlePrefix = item.type === ITEM_TYPES.PENDIENTE ? "Pendiente" : "Evento";
  const summary = `${titlePrefix}: ${item.title || "Sin título"}`;
  const description = [
    item.description || "",
    "",
    `Etiqueta: ${item.tag || "Trabajo"}`,
    `Recordatorio: ${item.reminder || "mismo_dia"}`,
    `Origen: AgendaJeff`
  ].join("\n");

  if (!item.date) {
    const today = new Date().toISOString().slice(0, 10);

    return {
      summary,
      description,
      start: {
        date: today
      },
      end: {
        date: today
      }
    };
  }

  if (!item.time) {
    return {
      summary,
      description,
      start: {
        date: item.date
      },
      end: {
        date: item.date
      }
    };
  }

  const start = `${item.date}T${item.time}:00`;
  const endDate = new Date(start);
  endDate.setHours(endDate.getHours() + 1);

  return {
    summary,
    description,
    start: {
      dateTime: start,
      timeZone: "America/Guayaquil"
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: "America/Guayaquil"
    }
  };
}

export async function createGoogleCalendarEvent(config = {}, item = {}) {
  const calendarId = encodeURIComponent(config.calendarId || "primary");
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const payload = buildGoogleCalendarPayload(item);

  const event = await googleCalendarRequest(config, endpoint, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    ok: true,
    message: "Evento creado en Google Calendar.",
    event
  };
}