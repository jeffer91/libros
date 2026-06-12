/*
=========================================================
Nombre completo: microsoft-service.js
Ruta o ubicación: /src/js/microsoft-service.js

Función o funciones:
1. Obtener token de acceso de Microsoft usando refresh token.
2. Probar conexión con Microsoft Graph.
3. Crear eventos en Microsoft Calendar/Outlook.
4. Manejar errores de credenciales incompletas.

Con qué se conecta:
- src/js/platform-service.js
- Microsoft OAuth
- Microsoft Graph API

Para qué sirve:
Sirve para sincronizar eventos de AgendaJeff con Microsoft Calendar/Outlook.
=========================================================
*/

import { ITEM_TYPES } from "./events.js";

export function validateMicrosoftConfig(config = {}) {
  const errors = [];

  if (!String(config.tenantId || "").trim()) {
    errors.push("Falta Tenant ID de Microsoft.");
  }

  if (!String(config.clientId || "").trim()) {
    errors.push("Falta Client ID de Microsoft.");
  }

  if (!String(config.clientSecret || "").trim()) {
    errors.push("Falta Client Secret de Microsoft.");
  }

  if (!String(config.refreshToken || "").trim()) {
    errors.push("Falta Refresh Token de Microsoft.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export async function getMicrosoftAccessToken(config = {}) {
  const validation = validateMicrosoftConfig(config);

  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const tenantId = config.tenantId || "common";
  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access Calendars.ReadWrite User.Read"
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "No se pudo obtener token de Microsoft.");
  }

  return data.access_token;
}

export async function microsoftGraphRequest(config, endpoint, options = {}) {
  const accessToken = await getMicrosoftAccessToken(config);

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
    throw new Error(data.error?.message || "Error en Microsoft Graph.");
  }

  return data;
}

export async function testMicrosoftCalendarConnection(config = {}) {
  const validation = validateMicrosoftConfig(config);

  if (!validation.ok) {
    return {
      ok: false,
      message: validation.errors.join(" ")
    };
  }

  try {
    const profile = await microsoftGraphRequest(config, "https://graph.microsoft.com/v1.0/me", {
      method: "GET"
    });

    return {
      ok: true,
      message: `Microsoft conectado: ${profile.userPrincipalName || profile.displayName || "cuenta válida"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "No se pudo conectar con Microsoft Calendar."
    };
  }
}

export function buildMicrosoftCalendarPayload(item = {}) {
  const titlePrefix = item.type === ITEM_TYPES.PENDIENTE ? "Pendiente" : "Evento";
  const subject = `${titlePrefix}: ${item.title || "Sin título"}`;

  const bodyContent = [
    item.description || "",
    "",
    `Etiqueta: ${item.tag || "Trabajo"}`,
    `Recordatorio: ${item.reminder || "mismo_dia"}`,
    `Origen: AgendaJeff`
  ].join("<br>");

  const safeDate = item.date || new Date().toISOString().slice(0, 10);
  const safeTime = item.time || "09:00";
  const startLocal = `${safeDate}T${safeTime}:00`;

  const endDate = new Date(startLocal);
  endDate.setHours(endDate.getHours() + 1);

  const endLocal = endDate.toISOString().slice(0, 19);

  return {
    subject,
    body: {
      contentType: "HTML",
      content: bodyContent
    },
    start: {
      dateTime: startLocal,
      timeZone: "America/Guayaquil"
    },
    end: {
      dateTime: endLocal,
      timeZone: "America/Guayaquil"
    }
  };
}

export async function createMicrosoftCalendarEvent(config = {}, item = {}) {
  const payload = buildMicrosoftCalendarPayload(item);

  const event = await microsoftGraphRequest(config, "https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    ok: true,
    message: "Evento creado en Microsoft Calendar.",
    event
  };
}