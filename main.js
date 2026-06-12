/*
=========================================================
Nombre completo: main.js
Ruta o ubicación: /main.js

Función o funciones:
1. Iniciar Electron.
2. Crear la ventana principal de AgendaJeff.
3. Cargar renderer.html.
4. Activar comunicación segura con preload.js.
5. Mostrar notificaciones reales de escritorio.
6. Usar logo si existe en src/assets/app-icon.png o app-icon.ico.
7. Revisar actualizaciones automáticas cuando la app esté instalada.
8. Descargar actualizaciones en segundo plano.
9. Instalar actualizaciones cuando la app se cierre.
10. Mantener la app funcional en modo desarrollo sin romper auto-update.

Con qué se conecta:
- package.json
- preload.js
- renderer.html
- electron-updater
- GitHub Releases
- Sistema operativo Windows

Para qué sirve:
Sirve como entrada principal de la app de escritorio AgendaJeff.
=========================================================
*/

const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, Notification, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let updateReadyToInstall = false;
let updateCheckTimer = null;
let lastUpdateState = {
  ok: true,
  status: "idle",
  message: "Actualizador en espera.",
  version: null,
  percent: 0,
  at: new Date().toISOString()
};

const APP_NAME = "AgendaJeff";
const APP_ID = "com.jeff.agendajeff";
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

function getIconPath() {
  const icoPath = path.join(__dirname, "src", "assets", "app-icon.ico");
  const pngPath = path.join(__dirname, "src", "assets", "app-icon.png");

  if (fs.existsSync(icoPath)) {
    return icoPath;
  }

  if (fs.existsSync(pngPath)) {
    return pngPath;
  }

  return null;
}

function getReleaseChannel() {
  const version = app.getVersion();

  if (String(version).toLowerCase().includes("beta")) {
    return "beta";
  }

  return "latest";
}

function createMainWindow() {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: "#f6f7fb",
    show: false,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile("renderer.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function canShowNotifications() {
  return Notification.isSupported();
}

function showDesktopNotification(payload = {}) {
  if (!canShowNotifications()) {
    return {
      ok: false,
      message: "Las notificaciones de escritorio no están soportadas en este sistema."
    };
  }

  const title = payload.title || APP_NAME;
  const body = payload.body || "Tienes un recordatorio pendiente.";
  const iconPath = getIconPath();

  let icon = null;

  if (iconPath) {
    icon = nativeImage.createFromPath(iconPath);
  }

  const notification = new Notification({
    title,
    body,
    silent: Boolean(payload.silent),
    ...(icon && !icon.isEmpty() ? { icon } : {})
  });

  notification.show();

  return {
    ok: true,
    message: "Notificación enviada correctamente."
  };
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function setUpdateState(status, data = {}) {
  lastUpdateState = {
    ok: data.ok !== false,
    status,
    message: data.message || "",
    version: data.version || null,
    percent: Number.isFinite(data.percent) ? data.percent : 0,
    at: new Date().toISOString()
  };

  sendToRenderer("agendaJeff:updateStatus", lastUpdateState);
}

function getSafeErrorMessage(error) {
  if (!error) {
    return "Error desconocido.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

function configureAutoUpdater() {
  const channel = getReleaseChannel();

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = channel === "beta";
  autoUpdater.channel = channel;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState("checking", {
      message: "Buscando actualizaciones..."
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateState("available", {
      message: "Hay una nueva versión disponible. Descargando en segundo plano...",
      version: info && info.version ? info.version : null
    });

    showDesktopNotification({
      title: "AgendaJeff",
      body: "Hay una nueva versión disponible. Se descargará automáticamente.",
      silent: true
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateState("not-available", {
      message: "AgendaJeff ya está actualizado.",
      version: info && info.version ? info.version : app.getVersion()
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = progress && Number.isFinite(progress.percent)
      ? Math.round(progress.percent)
      : 0;

    setUpdateState("downloading", {
      message: `Descargando actualización... ${percent}%`,
      percent
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateReadyToInstall = true;

    setUpdateState("downloaded", {
      message: "Actualización descargada. Se instalará automáticamente al cerrar la app.",
      version: info && info.version ? info.version : null,
      percent: 100
    });

    showDesktopNotification({
      title: "AgendaJeff",
      body: "La nueva versión ya está lista. Se instalará cuando cierres la app.",
      silent: false
    });
  });

  autoUpdater.on("error", (error) => {
    setUpdateState("error", {
      ok: false,
      message: getSafeErrorMessage(error)
    });
  });
}

async function checkForUpdatesSilently() {
  if (!app.isPackaged) {
    setUpdateState("disabled-dev", {
      message: "Auto-update desactivado en modo desarrollo. Funcionará cuando la app esté instalada."
    });

    return {
      ok: false,
      message: "Auto-update desactivado en modo desarrollo."
    };
  }

  try {
    await autoUpdater.checkForUpdates();

    return {
      ok: true,
      message: "Revisión de actualización ejecutada."
    };
  } catch (error) {
    const message = getSafeErrorMessage(error);

    setUpdateState("error", {
      ok: false,
      message
    });

    return {
      ok: false,
      message
    };
  }
}

function startAutoUpdateChecks() {
  configureAutoUpdater();

  setTimeout(() => {
    checkForUpdatesSilently();
  }, 8000);

  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }

  updateCheckTimer = setInterval(() => {
    checkForUpdatesSilently();
  }, UPDATE_CHECK_INTERVAL_MS);
}

function stopAutoUpdateChecks() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

ipcMain.handle("agendaJeff:appInfo", async () => {
  return {
    ok: true,
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    updateChannel: getReleaseChannel()
  };
});

ipcMain.handle("agendaJeff:notify", async (_event, payload) => {
  return showDesktopNotification(payload);
});

ipcMain.handle("agendaJeff:notificationStatus", async () => {
  return {
    ok: true,
    supported: canShowNotifications()
  };
});

ipcMain.handle("agendaJeff:updateStatus", async () => {
  return lastUpdateState;
});

ipcMain.handle("agendaJeff:checkForUpdates", async () => {
  return checkForUpdatesSilently();
});

ipcMain.handle("agendaJeff:installUpdate", async () => {
  if (!updateReadyToInstall) {
    return {
      ok: false,
      message: "No hay una actualización descargada para instalar."
    };
  }

  try {
    autoUpdater.quitAndInstall(true, false);

    return {
      ok: true,
      message: "Instalando actualización."
    };
  } catch (error) {
    return {
      ok: false,
      message: getSafeErrorMessage(error)
    };
  }
});

app.whenReady().then(() => {
  app.setName(APP_NAME);

  if (process.platform === "win32") {
    app.setAppUserModelId(APP_ID);
  }

  createMainWindow();
  startAutoUpdateChecks();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  stopAutoUpdateChecks();
});

app.on("window-all-closed", () => {
  if (updateReadyToInstall && app.isPackaged) {
    autoUpdater.quitAndInstall(true, false);
    return;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});