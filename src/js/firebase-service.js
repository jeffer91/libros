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

Con qué se conecta:
- src/js/firebase-config.js
- src/js/sync-service.js
- src/js/platform-service.js
- Firebase Firestore

Para qué sirve:
Sirve como capa central de comunicación con Firebase.
=========================================================
*/

import {
  FIREBASE_CONFIG,
  FIREBASE_PATHS,
  isFirebaseConfigured,
  getFirestoreBaseURL,
  getPrincipalDocumentPath,
  getItemsCollectionPath,
  getSettingsCollectionPath,
  getConnectionsCollectionPath,
  getVerificationDocumentPath
} from "./firebase-config.js";

const FIREBASE_TIMEOUT_MS = 8000;

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
        params.append(key, item);
      });
    } else if (value !== undefined && value !== null) {
      params.set(key, value);
    }
  });

  return `${base}/${safePath}?${params.toString()}`;
}

export function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value)
      }
    };
  }

  return { stringValue: String(value) };
}

export function toFirestoreFields(data = {}) {
  return Object.entries(data || {}).reduce((fields, [key, value]) => {
    fields[key] = toFirestoreValue(value);
    return fields;
  }, {});
}

export function fromFirestoreValue(value = {}) {
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

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }

  if ("mapValue" in value) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }

  return null;
}

export function fromFirestoreFields(fields = {}) {
  return Object.entries(fields || {}).reduce((data, [key, value]) => {
    data[key] = fromFirestoreValue(value);
    return data;
  }, {});
}

export function fromFirestoreDocument(document = {}) {
  const fields = fromFirestoreFields(document.fields || {});
  const nameParts = String(document.name || "").split("/");
  const documentId = nameParts[nameParts.length - 1];

  return {
    id: fields.id || documentId,
    ...fields,
    firebaseName: document.name || "",
    firebaseCreateTime: document.createTime || "",
    firebaseUpdateTime: document.updateTime || ""
  };
}

export async function firebaseRequest(url, options = {}) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase todavía no está configurado.");
  }

  if (!url) {
    throw new Error("La URL de Firebase está vacía.");
  }

  const {
    timeoutMs = FIREBASE_TIMEOUT_MS,
    headers = {},
    ...fetchOptions
  } = options;

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || "Error de comunicación con Firebase.";
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Firebase tardó demasiado en responder.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPrincipalDocument() {
  const url = buildFirebaseURL(getPrincipalDocumentPath());
  const response = await firebaseRequest(url, {
    method: "GET"
  });

  return fromFirestoreDocument(response);
}

export async function getImportantData() {
  const principal = await getPrincipalDocument();

  if (
    principal &&
    principal[FIREBASE_PATHS.importantMapField] &&
    typeof principal[FIREBASE_PATHS.importantMapField] === "object"
  ) {
    return principal[FIREBASE_PATHS.importantMapField];
  }

  if (principal && principal.datos && typeof principal.datos === "object") {
    return principal.datos;
  }

  return {};
}

export async function updateImportantDataPatch(patch = {}) {
  const current = await getPrincipalDocument().catch(() => ({}));
  const currentData = current[FIREBASE_PATHS.importantMapField] || current.datos || {};

  const updatedData = {
    ...currentData,
    ...patch
  };

  const payload = {
    fields: toFirestoreFields({
      actualizadoEn: new Date().toISOString(),
      datos: updatedData,
      proyecto: FIREBASE_CONFIG.projectId,
      modoGuardado: "electron-json",
      tipo: "datos_importantes"
    })
  };

  const url = buildFirebaseURL(getPrincipalDocumentPath(), {
    "updateMask.fieldPaths": [
      "actualizadoEn",
      "datos",
      "proyecto",
      "modoGuardado",
      "tipo"
    ]
  });

  const response = await firebaseRequest(url, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return fromFirestoreDocument(response);
}

export async function verifyFirebaseWrite() {
  const payload = {
    fields: toFirestoreFields({
      ok: true,
      mensaje: "Firebase guarda correctamente desde AgendaJeff",
      ruta: getVerificationDocumentPath(),
      proyecto: FIREBASE_CONFIG.projectId,
      modoGuardado: "electron-json",
      actualizadoEn: new Date().toISOString()
    })
  };

  const url = buildFirebaseURL(getVerificationDocumentPath());

  const response = await firebaseRequest(url, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return fromFirestoreDocument(response);
}

export async function upsertFirebaseItem(item) {
  const path = `${getItemsCollectionPath()}/${item.id}`;
  const url = buildFirebaseURL(path);

  const payload = {
    fields: toFirestoreFields({
      ...item,
      firebaseSyncedAt: new Date().toISOString()
    })
  };

  const response = await firebaseRequest(url, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return fromFirestoreDocument(response);
}

export async function deleteFirebaseItem(itemId) {
  const path = `${getItemsCollectionPath()}/${itemId}`;
  const url = buildFirebaseURL(path);

  await firebaseRequest(url, {
    method: "DELETE"
  });

  return true;
}

export async function getFirebaseItems() {
  const url = buildFirebaseURL(getItemsCollectionPath());

  try {
    const response = await firebaseRequest(url, {
      method: "GET"
    });

    return (response.documents || []).map(fromFirestoreDocument);
  } catch (error) {
    if (String(error.message || "").includes("NOT_FOUND")) {
      return [];
    }

    throw error;
  }
}

export async function saveFirebaseSetting(key, value) {
  const path = `${getSettingsCollectionPath()}/${key}`;
  const url = buildFirebaseURL(path);

  const payload = {
    fields: toFirestoreFields({
      key,
      value,
      updatedAt: new Date().toISOString()
    })
  };

  const response = await firebaseRequest(url, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return fromFirestoreDocument(response);
}

export async function getFirebaseSetting(key) {
  const path = `${getSettingsCollectionPath()}/${key}`;
  const url = buildFirebaseURL(path);

  const response = await firebaseRequest(url, {
    method: "GET"
  });

  return fromFirestoreDocument(response);
}

export async function saveFirebaseConnection(platformName, connectionData = {}) {
  const path = `${getConnectionsCollectionPath()}/${platformName}`;
  const url = buildFirebaseURL(path);

  const payload = {
    fields: toFirestoreFields({
      platformName,
      ...connectionData,
      updatedAt: new Date().toISOString()
    })
  };

  const response = await firebaseRequest(url, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return fromFirestoreDocument(response);
}

export async function getFirebaseConnection(platformName) {
  const path = `${getConnectionsCollectionPath()}/${platformName}`;
  const url = buildFirebaseURL(path);

  const response = await firebaseRequest(url, {
    method: "GET"
  });

  return fromFirestoreDocument(response);
}