/*
=========================================================
Nombre completo: preload.js
Ruta o ubicación: /preload.js

Función o funciones:
1. Crear un puente seguro entre Electron y la interfaz.
2. Permitir que el frontend solicite notificaciones de escritorio.
3. Entregar información básica de la app.
4. Evitar que el frontend tenga acceso directo a Node.js.

Con qué se conecta:
- main.js
- renderer.html
- src/js/app.js
- src/js/desktop-notifications.js

Para qué sirve:
Sirve para que la pantalla pueda comunicarse con Electron
de forma segura sin exponer funciones peligrosas.
=========================================================
*/

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agendaJeff", {
  appInfo: async () => {
    return ipcRenderer.invoke("agendaJeff:appInfo");
  },

  notify: async (payload) => {
    return ipcRenderer.invoke("agendaJeff:notify", payload);
  },

  notificationStatus: async () => {
    return ipcRenderer.invoke("agendaJeff:notificationStatus");
  },

  platform: {
    isElectron: true
  }
});