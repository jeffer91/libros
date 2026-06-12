/*
=========================================================
Nombre completo: telegram-service.js
Ruta o ubicación: /src/js/telegram-service.js

Función o funciones:
1. Probar conexión con Telegram Bot API.
2. Enviar mensajes de eventos y pendientes a Telegram.
3. Validar token y chat ID.
4. Devolver errores claros para mostrar conexión en rojo.

Con qué se conecta:
- src/js/platform-service.js
- src/js/reminders.js
- Telegram Bot API

Para qué sirve:
Sirve para enviar recordatorios a Telegram.
=========================================================
*/

import { buildReminderMessage } from "./reminders.js";

export function validateTelegramConfig(config = {}) {
  const errors = [];

  if (!String(config.botToken || "").trim()) {
    errors.push("Falta el token del bot de Telegram.");
  }

  if (!String(config.chatId || "").trim()) {
    errors.push("Falta el chat ID de Telegram.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function getTelegramBaseURL(botToken) {
  return `https://api.telegram.org/bot${encodeURIComponent(botToken)}`;
}

export async function telegramRequest(config, method, payload = null) {
  const validation = validateTelegramConfig(config);

  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  const url = `${getTelegramBaseURL(config.botToken)}/${method}`;

  const options = payload
    ? {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    : {
        method: "GET"
      };

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.description || "Telegram no respondió correctamente.");
  }

  return data;
}

export async function testTelegramConnection(config = {}) {
  const validation = validateTelegramConfig(config);

  if (!validation.ok) {
    return {
      ok: false,
      message: validation.errors.join(" ")
    };
  }

  try {
    const botInfo = await telegramRequest(config, "getMe");

    await telegramRequest(config, "sendMessage", {
      chat_id: config.chatId,
      text: "AgendaJeff: prueba de conexión correcta.",
      disable_notification: true
    });

    return {
      ok: true,
      message: `Telegram conectado: ${botInfo.result?.username || "bot válido"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "No se pudo conectar con Telegram."
    };
  }
}

export function buildTelegramText(item = {}) {
  const message = buildReminderMessage(item);

  return [
    `📌 ${message.title}`,
    "",
    message.body
  ].join("\n");
}

export async function sendTelegramReminder(config = {}, item = {}) {
  const text = buildTelegramText(item);

  await telegramRequest(config, "sendMessage", {
    chat_id: config.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });

  return {
    ok: true,
    message: "Mensaje enviado a Telegram."
  };
}