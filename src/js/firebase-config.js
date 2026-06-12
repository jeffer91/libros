/*
=========================================================
Nombre completo: firebase-config.js
Ruta o ubicación: /src/js/firebase-config.js

Función o funciones:
1. Centralizar la configuración real de Firebase.
2. Usar el proyecto real jeff-2f92d.
3. Leer el documento existente respaldos_datos_importantes/principal.
4. Mantener eventos en subcolección separada para no dañar datos existentes.
5. Centralizar rutas de eventos, configuración, conexiones y verificación.

Con qué se conecta:
- src/js/firebase-service.js
- src/js/sync-service.js
- src/js/platform-service.js

Para qué sirve:
Sirve como único punto de configuración de Firebase para AgendaJeff.
=========================================================
*/

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAJgkVqr7p_GKnYFTSHybvBLyFGHplE_uc",
  authDomain: "jeff-2f92d.firebaseapp.com",
  projectId: "jeff-2f92d",
  storageBucket: "jeff-2f92d.firebasestorage.app",
  messagingSenderId: "337984443748",
  appId: "1:337984443748:web:86e7019aa4a5559c3b9671",
  measurementId: "G-PMQ5N15D5Y"
};

export const FIREBASE_PATHS = {
  rootCollection: "respaldos_datos_importantes",
  principalDocument: "principal",
  importantMapField: "datos",

  itemsCollection: "agenda_eventos",
  settingsCollection: "agenda_settings",
  connectionsCollection: "agenda_connections",
  syncCollection: "agenda_sync",

  verificationCollection: "verificacion_app",
  verificationDocument: "storage_js"
};

export function isFirebaseConfigured() {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId
  );
}

export function getFirestoreBaseURL() {
  if (!isFirebaseConfigured()) {
    return "";
  }

  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
}

export function getPrincipalDocumentPath() {
  return `${FIREBASE_PATHS.rootCollection}/${FIREBASE_PATHS.principalDocument}`;
}

export function getItemsCollectionPath() {
  return `${getPrincipalDocumentPath()}/${FIREBASE_PATHS.itemsCollection}`;
}

export function getSettingsCollectionPath() {
  return `${getPrincipalDocumentPath()}/${FIREBASE_PATHS.settingsCollection}`;
}

export function getConnectionsCollectionPath() {
  return `${getPrincipalDocumentPath()}/${FIREBASE_PATHS.connectionsCollection}`;
}

export function getSyncCollectionPath() {
  return `${getPrincipalDocumentPath()}/${FIREBASE_PATHS.syncCollection}`;
}

export function getVerificationDocumentPath() {
  return `${FIREBASE_PATHS.verificationCollection}/${FIREBASE_PATHS.verificationDocument}`;
}