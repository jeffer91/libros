/*
=========================================================
Nombre completo: firebase-service.js
Ruta o ubicación: /src/js/firebase-service.js

Función o funciones:
1. Leer y guardar datos en Firebase Firestore mediante REST.
2. Leer el documento real respaldos_datos_importantes/principal.
3. Extraer credenciales desde el mapa datos.
4. Guardar eventos en subcolección agenda_eventos.
5. Guardar configuraciones y conexiones sin romper la estructura existente.
6. Evitar que la app se quede congelada si Firebase tarda demasiado.
7. Borrar duplicados de Firebase en lote.

Con qué se conecta:
- src/js/firebase-config.js
- src/js/sync-service.js
- src/js/platform-service.js
- src/js/duplicate-service.js
- Firebase Firestore

Para qué sirve:
Sirve como capa central de comunicación con Firebase.
=========================================================
*/

import {
  FIREBASE_CONFIG,
  isFirebaseConfigured,
  getFirestoreBaseURL,
  getPrincipalDocumentPath,
  getItemsCollectionPath,
  getSettingsCollectionPath,
  getConnectionsCollectionPath,
  getVerificationDocumentPath
} from "./firebase-config.js";

const FIREBASE_TIMEOUT_MS = 10000;

export function buildFirebaseURL(path, extraParams = {}) {
  const base = getFirestoreBaseURL();

  if (!base) {
    return "";
  }

  const safePath = String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const params = new URLSearchParams();
  params.set("key", FIREBASE_CONFIG.apiKey);

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, item);
        }
      });

      return;
    }

    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  return `${base}/${safePath}?${params.toString()}`;
}

function withTimeout(promise, timeoutMs = FIREBASE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Firebase tardó demasiado en responder."));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function firebaseRequest(path, options = {}, extraParams = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase no está configurado.");
  }

  const url = buildFirebaseURL(path, extraParams);

  if (!url) {
    throw new Error("No se pudo construir la URL de Firebase.");
  }

  const response = await withTimeout(fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  }));

  if (!response.ok) {
    let detail = "";

    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message || "";
    } catch (_error) {
      detail = await response.text().catch(() => "");
    }

    throw new Error(detail || `Firebase respondió con estado ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function jsToFirestoreValue(value) {
  if (value === null || value === undefined) {
    return {
      nullValue: null
    };
  }

  if (typeof value === "string") {
    return {
      stringValue: value
    };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return {
        integerValue: String(value)
      };
    }

    return {
      doubleValue: value
    };
  }

  if (typeof value === "boolean") {
    return {
      booleanValue: value
    };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(jsToFirestoreValue)
      }
    };
  }

  if (typeof value === "object") {
    const fields = {};

    Object.entries(value).forEach(([key, childValue]) => {
      if (childValue !== undefined) {
        fields[key] = jsToFirestoreValue(childValue);
      }
    });

    return {
      mapValue: {
        fields
      }
    };
  }

  return {
    stringValue: String(value)
  };
}

function firestoreValueToJS(value = {}) {
  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("integerValue" in value) {
    return Number(value.integerValue);
  }

  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }

  if ("booleanValue" in value) {
    return Boolean(value.booleanValue);
  }

  if ("nullValue" in value) {
    return null;
  }

  if ("timestampValue" in value) {
    return value.timestampValue;
  }

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJS);
  }

  if ("mapValue" in value) {
    const result = {};

    Object.entries(value.mapValue.fields || {}).forEach(([key, childValue]) => {
      result[key] = firestoreValueToJS(childValue);
    });

    return result;
  }

  return null;
}

function jsObjectToFirestoreFields(data = {}) {
  const fields = {};

  Object.entries(data || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      fields[key] = jsToFirestoreValue(value);
    }
  });

  return fields;
}

function firestoreDocumentToObject(document = {}) {
  const result = {};

  Object.entries(document.fields || {}).forEach(([key, value]) => {
    result[key] = firestoreValueToJS(value);
  });

  const nameParts = String(document.name || "").split("/");
  const id = result.id || nameParts[nameParts.length - 1] || "";

  return {
    id,
    ...result
  };
}

function buildUpdateMask(data = {}) {
  return Object.keys(data || {})
    .filter((key) => key && data[key] !== undefined)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
}

async function patchDocument(path, data = {}) {
  const cleanData = {
    ...data,
    updatedAt: data.updatedAt || new Date().toISOString()
  };

  const body = {
    fields: jsObjectToFirestoreFields(cleanData)
  };

  const mask = buildUpdateMask(cleanData);
  const urlPath = path;

  const result = await firebaseRequest(urlPath, {
    method: "PATCH",
    body: JSON.stringify(body)
  }, {});

  return firestoreDocumentToObject(result);
}

export async function verifyFirebaseConnection() {
  const path = getVerificationDocumentPath();

  try {
    await firebaseRequest(path, {
      method: "GET"
    });

    return {
      ok: true,
      message: "Firebase conectado correctamente."
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || "No se pudo conectar con Firebase."
    };
  }
}

export async function getImportantDocument() {
  const document = await firebaseRequest(getPrincipalDocumentPath(), {
    method: "GET"
  });

  return firestoreDocumentToObject(document);
}

export async function getImportantData() {
  const document = await getImportantDocument();

  if (document.datos && typeof document.datos === "object") {
    return document.datos;
  }

  return document;
}

export async function updateImportantDataPatch(patch = {}) {
  const currentData = await getImportantData().catch(() => ({}));
  const nextData = {
    ...currentData,
    ...patch
  };

  return patchDocument(getPrincipalDocumentPath(), {
    datos: nextData,
    updatedAt: new Date().toISOString()
  });
}

export async function getFirebaseItems() {
  const collectionPath = getItemsCollectionPath();
  const allItems = [];
  let pageToken = "";

  do {
    const params = {
      pageSize: 300
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const result = await firebaseRequest(collectionPath, {
      method: "GET"
    }, params);

    const documents = Array.isArray(result?.documents) ? result.documents : [];

    documents.forEach((document) => {
      const item = firestoreDocumentToObject(document);

      if (item.id) {
        allItems.push(item);
      }
    });

    pageToken = result?.nextPageToken || "";
  } while (pageToken);

  return allItems;
}

export async function upsertFirebaseItem(item = {}) {
  if (!item.id) {
    throw new Error("No se puede guardar en Firebase un evento sin id.");
  }

  const path = `${getItemsCollectionPath()}/${item.id}`;

  const payload = {
    ...item,
    updatedAt: item.updatedAt || new Date().toISOString()
  };

  return patchDocument(path, payload);
}

export async function saveManyFirebaseItems(items = []) {
  const savedItems = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id) {
      continue;
    }

    const savedItem = await upsertFirebaseItem(item);
    savedItems.push(savedItem);
  }

  return savedItems;
}

export async function deleteFirebaseItem(itemId) {
  if (!itemId) {
    return false;
  }

  const path = `${getItemsCollectionPath()}/${itemId}`;

  try {
    await firebaseRequest(path, {
      method: "DELETE"
    });

    return true;
  } catch (error) {
    if (String(error.message || "").includes("NOT_FOUND")) {
      return true;
    }

    throw error;
  }
}

export async function deleteManyFirebaseItems(itemIds = []) {
  const ids = Array.from(new Set((Array.isArray(itemIds) ? itemIds : []).filter(Boolean)));
  const result = {
    ok: true,
    deleted: 0,
    failed: []
  };

  for (const itemId of ids) {
    try {
      await deleteFirebaseItem(itemId);
      result.deleted += 1;
    } catch (error) {
      result.ok = false;
      result.failed.push({
        id: itemId,
        error: error.message || "No se pudo eliminar de Firebase."
      });
    }
  }

  return result;
}

export async function saveFirebaseSetting(key, value) {
  if (!key) {
    throw new Error("No se puede guardar configuración sin clave.");
  }

  const path = `${getSettingsCollectionPath()}/${key}`;

  return patchDocument(path, {
    key,
    value,
    updatedAt: new Date().toISOString()
  });
}

export async function getFirebaseSetting(key, fallback = null) {
  if (!key) {
    return fallback;
  }

  try {
    const document = await firebaseRequest(`${getSettingsCollectionPath()}/${key}`, {
      method: "GET"
    });

    const record = firestoreDocumentToObject(document);

    return record.value ?? fallback;
  } catch (error) {
    if (String(error.message || "").includes("NOT_FOUND")) {
      return fallback;
    }

    throw error;
  }
}

export async function saveFirebaseConnection(platformName, config = {}) {
  if (!platformName) {
    throw new Error("No se puede guardar una conexión sin nombre de plataforma.");
  }

  const path = `${getConnectionsCollectionPath()}/${platformName}`;

  return patchDocument(path, {
    platformName,
    ...config,
    updatedAt: new Date().toISOString()
  });
}

export async function getFirebaseConnection(platformName, fallback = null) {
  if (!platformName) {
    return fallback;
  }

  try {
    const document = await firebaseRequest(`${getConnectionsCollectionPath()}/${platformName}`, {
      method: "GET"
    });

    return firestoreDocumentToObject(document);
  } catch (error) {
    if (String(error.message || "").includes("NOT_FOUND")) {
      return fallback;
    }

    throw error;
  }
}

export async function getAllFirebaseConnections() {
  const collectionPath = getConnectionsCollectionPath();
  const result = await firebaseRequest(collectionPath, {
    method: "GET"
  }, {
    pageSize: 100
  });

  const documents = Array.isArray(result?.documents) ? result.documents : [];
  const connections = {};

  documents.forEach((document) => {
    const connection = firestoreDocumentToObject(document);
    const platformName = connection.platformName || connection.id;

    if (platformName) {
      connections[platformName] = connection;
    }
  });

  return connections;
}

export async function deleteFirebaseConnection(platformName) {
  if (!platformName) {
    return false;
  }

  const path = `${getConnectionsCollectionPath()}/${platformName}`;

  try {
    await firebaseRequest(path, {
      method: "DELETE"
    });

    return true;
  } catch (error) {
    if (String(error.message || "").includes("NOT_FOUND")) {
      return true;
    }

    throw error;
  }
}