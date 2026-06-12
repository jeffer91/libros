/*
=========================================================
Nombre completo: bulk-parser.js
Ruta o ubicación: /src/js/bulk-parser.js

Función o funciones:
1. Leer texto pegado, tablas copiadas, CSV, TXT, Excel y PDF.
2. Interpretar cronogramas y convertirlos en registros.
3. Normalizar fechas, horas, tipo, etiqueta y descripción.
4. Devolver errores para corrección manual antes de guardar.
5. Detectar tablas con Actividad / Fecha inicio / Fecha fin.
6. Detectar tablas con Día / Hora / Sede / Cédula / Nombre / Carrera.
7. Poner 09:00 por defecto cuando un evento no tenga hora.
8. Poner recordatorio a las 06:00 cuando la hora fue automática.

Con qué se conecta:
- src/js/bulk-preview.js
- src/js/events.js
- renderer.html
- xlsx
- pdfjs-dist

Para qué sirve:
Sirve para la carga masiva inteligente de AgendaJeff.
=========================================================
*/

import { buildAgendaItem, ITEM_TYPES } from "./events.js";

const DEFAULT_TAG = "Trabajo";
const DEFAULT_ACADEMIC_TAG = "Académico";
const DEFAULT_BULK_EVENT_TIME = "09:00";
const DEFAULT_BULK_REMINDER_TIME = "06:00";

export function normalizeSpaces(value) {
return String(value || "")
.replace(/\u00A0/g, " ")
.replace(/[ ]+/g, " ")
.trim();
}

export function normalizeTextKey(value) {
return normalizeSpaces(value)
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.toLowerCase()
.replace(/[^a-z0-9]+/g, " ")
.trim();
}

export function parseDate(value) {
const text = normalizeSpaces(value);

if (!text) {
return "";
}

const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

if (isoMatch) {
return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
}

const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);

if (slashMatch) {
const day = String(slashMatch[1]).padStart(2, "0");
const month = String(slashMatch[2]).padStart(2, "0");
const year = slashMatch[3];

return `${year}-${month}-${day}`;
}

return "";
}

export function normalizeTimeText(value) {
return normalizeSpaces(value)
.replace(/\bA\b/g, "a")
.replace(/\s*:\s*/g, ":")
.replace(/\s*\.\s*/g, ".")
.trim();
}

export function formatTime(hour, minute) {
return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseAllTimes(value) {
const text = normalizeTimeText(value);

if (!text) {
return [];
}

const times = [];
const timeRegex = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g;

let match = timeRegex.exec(text);

while (match) {
times.push(formatTime(match[1], match[2]));
match = timeRegex.exec(text);
}

const amPmRegex = /\b(0?[1-9]|1[0-2])\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/gi;
let amPmMatch = amPmRegex.exec(text);

while (amPmMatch) {
let hour = Number(amPmMatch[1]);
const marker = amPmMatch[2].toLowerCase();

if (marker.includes("p") && hour < 12) {
hour += 12;
}

if (marker.includes("a") && hour === 12) {
hour = 0;
}

times.push(formatTime(hour, "00"));
amPmMatch = amPmRegex.exec(text);
}

return times;
}

export function parseTime(value) {
const times = parseAllTimes(value);
return times[0] || "";
}

export function parseEndTime(value) {
const times = parseAllTimes(value);
return times[1] || "";
}

export function detectType(rowText) {
const text = normalizeTextKey(rowText);

if (
text.includes("pendiente") ||
text.includes("tarea") ||
text.includes("por hacer") ||
text.includes("hasta completar")
) {
return ITEM_TYPES.PENDIENTE;
}

return ITEM_TYPES.EVENTO;
}

export function detectReminder(rowText, type = ITEM_TYPES.EVENTO) {
const text = normalizeTextKey(rowText);

if (type === ITEM_TYPES.PENDIENTE) {
return "hasta_completar";
}

if (text.includes("5 dias") || text.includes("cinco dias")) {
return "cinco_dias_antes";
}

if (text.includes("3 dias") || text.includes("tres dias")) {
return "tres_dias_antes";
}

return "mismo_dia";
}

export function detectTag(rowText) {
const tags = ["Trabajo", "Personal", "Titulación", "Reunión", "Urgente", "Pago", "Académico"];
const text = normalizeTextKey(rowText);

const found = tags.find((tag) => {
return text.includes(normalizeTextKey(tag));
});

return found || DEFAULT_TAG;
}

export function splitSmartLine(line) {
const raw = String(line || "").replace(/\u00A0/g, " ");

if (raw.includes("\t")) {
return raw.split("\t").map(normalizeSpaces);
}

const clean = normalizeSpaces(raw);

if (!clean) {
return [];
}

if (clean.includes("|")) {
return clean.split("|").map(normalizeSpaces);
}

if (clean.includes(";")) {
return clean.split(";").map(normalizeSpaces);
}

return [clean];
}

export function getNonEmptyColumns(columns = []) {
return columns.map(normalizeSpaces).filter(Boolean);
}

export function isHeaderLine(line) {
const key = normalizeTextKey(line);

if (!key) {
return true;
}

const headerPatterns = [
"actividad fecha inicio fecha fin",
"dia hora sede cedula nombre carrera",
"dia hora sede cédula nombre carrera",
"fecha hora sede cedula nombre carrera",
"fecha hora sede cédula nombre carrera"
];

return headerPatterns.some((pattern) => {
return key === normalizeTextKey(pattern) || key.includes(normalizeTextKey(pattern));
});
}

export function isSectionLine(line) {
const clean = normalizeSpaces(line);

if (!clean) {
return false;
}

if (isHeaderLine(clean)) {
return false;
}

const date = parseDate(clean);
const time = parseTime(clean);

if (date || time) {
return false;
}

const key = normalizeTextKey(clean);

if (key.startsWith("fase ")) {
return true;
}

if (key.includes("noviembre") || key.includes("mayo") || key.includes("superiores")) {
return true;
}

return clean.length <= 140;
}

export function buildDescription(parts = []) {
return parts
.map((part) => normalizeSpaces(part))
.filter(Boolean)
.join(" | ");
}

export function removeDatesAndTimesFromTitle(value) {
return normalizeSpaces(value)
.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "")
.replace(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g, "")
.replace(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/g, "")
.replace(/\b(0?[1-9]|1[0-2])\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/gi, "")
.replace(/\b(evento|pendiente|tarea)\b/gi, "")
.replace(/\s+\|\s+/g, " ")
.trim();
}

export function applyBulkDefaults(rawItem = {}) {
const type = rawItem.type || ITEM_TYPES.EVENTO;
const detectedTime = rawItem.time || "";

const needsDefaultEventTime = type === ITEM_TYPES.EVENTO && rawItem.date && !detectedTime;

return {
...rawItem,
time: needsDefaultEventTime ? DEFAULT_BULK_EVENT_TIME : detectedTime,
reminder: rawItem.reminder || "mismo_dia",
reminderTime: needsDefaultEventTime ? DEFAULT_BULK_REMINDER_TIME : (rawItem.reminderTime || "")
};
}

export function parseAppointmentRow(columns = [], fullText = "", index = 0, context = {}) {
const date = parseDate(columns[0]);
const time = parseTime(columns[1]);

if (!date || !time || columns.length < 5) {
return null;
}

const endTime = parseEndTime(columns[1]);
const sede = normalizeSpaces(columns[2]);
const cedula = normalizeSpaces(columns[3]);
const nombre = normalizeSpaces(columns[4]) || `Registro ${index + 1}`;
const carrera = normalizeSpaces(columns[5]);

const title = carrera ? `${nombre} - ${carrera}` : nombre;

const description = buildDescription([
context.section ? `Grupo: ${context.section}` : "",
columns[1] ? `Horario: ${columns[1]}` : "",
endTime ? `Hora fin: ${endTime}` : "",
sede ? `Sede: ${sede}` : "",
cedula ? `Cédula: ${cedula}` : "",
carrera ? `Carrera: ${carrera}` : ""
]);

return {
type: ITEM_TYPES.EVENTO,
title,
date,
time,
endTime,
tag: DEFAULT_ACADEMIC_TAG,
reminder: "mismo_dia",
reminderTime: "",
description: description || fullText,
source: "bulk-text"
};
}

export function parseScheduleRow(columns = [], fullText = "", index = 0, context = {}) {
const nonEmptyColumns = getNonEmptyColumns(columns);

if (nonEmptyColumns.length < 3) {
return null;
}

const title = normalizeSpaces(nonEmptyColumns[0]);
const startDate = parseDate(nonEmptyColumns[1]);
const endDate = parseDate(nonEmptyColumns[2]);

if (!title || !startDate || !endDate) {
return null;
}

const detectedTime = parseTime(fullText);
const tagText = `${title} ${context.section || ""}`;
const tag = detectTag(tagText) === DEFAULT_TAG ? DEFAULT_ACADEMIC_TAG : detectTag(tagText);

const description = buildDescription([
context.section ? `Grupo: ${context.section}` : "",
`Fecha inicio: ${startDate}`,
`Fecha fin: ${endDate}`,
endDate !== startDate ? `Rango: ${startDate} a ${endDate}` : ""
]);

return applyBulkDefaults({
type: ITEM_TYPES.EVENTO,
title,
date: startDate,
endDate,
time: detectedTime,
tag,
reminder: "mismo_dia",
description,
source: "bulk-text"
});
}

export function parseGenericRow(columns = [], fullText = "", index = 0, context = {}) {
const date = parseDate(fullText);

if (!date) {
return null;
}

const type = detectType(fullText);
const detectedTime = parseTime(fullText);
const tag = detectTag(`${fullText} ${context.section || ""}`);
const reminder = detectReminder(fullText, type);

let title = "";

if (columns.length >= 3) {
const nonEmptyColumns = getNonEmptyColumns(columns);
title = nonEmptyColumns[0] || "";
} else {
title = removeDatesAndTimesFromTitle(fullText);
}

if (!title) {
title = `Registro ${index + 1}`;
}

const description = buildDescription([
context.section ? `Grupo: ${context.section}` : "",
fullText
]);

return applyBulkDefaults({
type,
title,
date,
time: detectedTime,
tag,
reminder,
description,
source: "bulk-text"
});
}

export function parseLineToRawItem(line, index = 0, context = {}) {
const fullText = normalizeSpaces(line);

if (!fullText || isHeaderLine(fullText) || isSectionLine(fullText)) {
return null;
}

const columns = splitSmartLine(line);

const appointmentItem = parseAppointmentRow(columns, fullText, index, context);

if (appointmentItem) {
return appointmentItem;
}

const scheduleItem = parseScheduleRow(columns, fullText, index, context);

if (scheduleItem) {
return scheduleItem;
}

return parseGenericRow(columns, fullText, index, context);
}

export function parseTextToItems(text = "") {
const lines = String(text || "").split(/\r?\n/);
const parsed = [];

let currentSection = "";

lines.forEach((line, index) => {
const cleanLine = normalizeSpaces(line);

if (!cleanLine) {
return;
}

if (isHeaderLine(cleanLine)) {
return;
}

if (isSectionLine(cleanLine)) {
currentSection = cleanLine;
return;
}

const raw = parseLineToRawItem(line, index, {
section: currentSection
});

if (!raw) {
return;
}

const { item, validation } = buildAgendaItem(raw);

parsed.push({
index: parsed.length + 1,
original: line,
item,
valid: validation.ok,
errors: validation.errors
});
});

return parsed;
}

export function rowsToText(rows = []) {
return rows.map((row) => {
return row.map((cell) => normalizeSpaces(cell)).join("\t");
}).join("\n");
}

export async function readTextFile(file) {
return file.text();
}

export async function readExcelFile(file) {
const XLSX = await import("../../node_modules/xlsx/xlsx.mjs");
const buffer = await file.arrayBuffer();
const workbook = XLSX.read(buffer, { type: "array" });
const firstSheetName = workbook.SheetNames[0];

if (!firstSheetName) {
return "";
}

const sheet = workbook.Sheets[firstSheetName];
const rows = XLSX.utils.sheet_to_json(sheet, {
header: 1,
defval: ""
});

return rowsToText(rows);
}

export async function readPdfFile(file) {
const pdfjsLib = await import("../../node_modules/pdfjs-dist/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = "./node_modules/pdfjs-dist/build/pdf.worker.mjs";

const buffer = await file.arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

const pages = [];

for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
const page = await pdf.getPage(pageNumber);
const content = await page.getTextContent();

const pageText = content.items
.map((item) => item.str)
.join(" ");

pages.push(pageText);
}

return pages.join("\n");
}

export async function parseFileToItems(file) {
if (!file) {
return [];
}

const name = String(file.name || "").toLowerCase();

let text = "";

if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
text = await readExcelFile(file);
} else if (name.endsWith(".pdf")) {
text = await readPdfFile(file);
} else {
text = await readTextFile(file);
}

return parseTextToItems(text);
}

export function summarizeBulkResult(parsedRows = []) {
const validRows = parsedRows.filter((row) => row.valid);
const invalidRows = parsedRows.filter((row) => !row.valid);

return {
total: parsedRows.length,
valid: validRows.length,
invalid: invalidRows.length,
validRows,
invalidRows
};
}