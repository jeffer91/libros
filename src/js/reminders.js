/*
=========================================================
Nombre completo: reminders.js
Ruta o ubicación: /src/js/reminders.js

Función o funciones:
1. Calcular recordatorios por categoría.
2. Detectar recordatorios vencidos o pendientes.
3. Manejar recordatorios de pendientes “hasta completar”.
4. Preparar mensajes para escritorio, Telegram, Google y Microsoft.
5. Respetar reminderTime cuando un evento tenga hora de aviso propia.

Con qué se conecta:
- src/js/events.js
- src/js/desktop-notifications.js
- src/js/telegram-service.js
- src/js/google-service.js
- src/js/microsoft-service.js
- src/js/sync-service.js

Para qué sirve:
Sirve para que los eventos y pendientes generen recordatorios
automáticos según su categoría.
=========================================================
*/

import { ITEM_STATUS, ITEM_TYPES } from "./events.js";

export const REMINDER_TYPES = {
MISMO_DIA: "mismo_dia",
TRES_DIAS_ANTES: "tres_dias_antes",
CINCO_DIAS_ANTES: "cinco_dias_antes",
HASTA_COMPLETAR: "hasta_completar"
};

export function buildDateTime(date, time = "09:00") {
if (!date) {
return null;
}

const safeTime = time || "09:00";
const value = new Date(`${date}T${safeTime}:00`);

if (Number.isNaN(value.getTime())) {
return null;
}

return value;
}

export function subtractDays(date, days) {
const result = new Date(date);
result.setDate(result.getDate() - days);
return result;
}

export function getReminderBaseTime(item = {}) {
return item.reminderTime || item.time || "09:00";
}

export function getReminderDate(item = {}) {
if (item.type === ITEM_TYPES.PENDIENTE && item.reminder === REMINDER_TYPES.HASTA_COMPLETAR) {
return null;
}

const eventDate = buildDateTime(item.date, item.time);

if (!eventDate) {
return null;
}

if (item.reminder === REMINDER_TYPES.MISMO_DIA) {
return buildDateTime(item.date, getReminderBaseTime(item)) || eventDate;
}

if (item.reminder === REMINDER_TYPES.TRES_DIAS_ANTES) {
const baseDate = buildDateTime(item.date, getReminderBaseTime(item)) || eventDate;
return subtractDays(baseDate, 3);
}

if (item.reminder === REMINDER_TYPES.CINCO_DIAS_ANTES) {
const baseDate = buildDateTime(item.date, getReminderBaseTime(item)) || eventDate;
return subtractDays(baseDate, 5);
}

return eventDate;
}

export function isReminderDue(item = {}, referenceDate = new Date()) {
if (item.status !== ITEM_STATUS.ACTIVO) {
return false;
}

if (item.type === ITEM_TYPES.PENDIENTE && item.reminder === REMINDER_TYPES.HASTA_COMPLETAR) {
return true;
}

const reminderDate = getReminderDate(item);

if (!reminderDate) {
return false;
}

return reminderDate <= referenceDate;
}

export function getReminderLabel(reminderType) {
const labels = {
[REMINDER_TYPES.MISMO_DIA]: "Mismo día",
[REMINDER_TYPES.TRES_DIAS_ANTES]: "3 días antes",
[REMINDER_TYPES.CINCO_DIAS_ANTES]: "5 días antes",
[REMINDER_TYPES.HASTA_COMPLETAR]: "Hasta que se complete"
};

return labels[reminderType] || "Mismo día";
}

export function buildReminderMessage(item = {}) {
const typeLabel = item.type === ITEM_TYPES.PENDIENTE ? "Pendiente" : "Evento";
const reminderLabel = getReminderLabel(item.reminder);

const title = `${typeLabel}: ${item.title || "Sin título"}`;

const parts = [
item.description ? `Detalle: ${item.description}` : "",
item.date ? `Fecha: ${item.date}` : "",
item.endDate ? `Fecha fin: ${item.endDate}` : "",
item.time ? `Hora: ${item.time}` : "",
item.endTime ? `Hora fin: ${item.endTime}` : "",
item.reminderTime ? `Hora de recordatorio: ${item.reminderTime}` : "",
item.tag ? `Etiqueta: ${item.tag}` : "",
`Recordatorio: ${reminderLabel}`
].filter(Boolean);

return {
title,
body: parts.join("\n")
};
}

export function getDueReminders(items = [], referenceDate = new Date()) {
return items.filter((item) => {
return isReminderDue(item, referenceDate);
});
}

export function shouldRepeatUntilCompleted(item = {}) {
return item.type === ITEM_TYPES.PENDIENTE &&
item.status === ITEM_STATUS.ACTIVO &&
item.reminder === REMINDER_TYPES.HASTA_COMPLETAR;
}

export function markReminderSent(item = {}, platformName = "desktop") {
const remindersSent = {
...(item.remindersSent || {})
};

remindersSent[platformName] = new Date().toISOString();

return {
...item,
remindersSent,
updatedAt: new Date().toISOString()
};
}