export async function initializeLocalStorage() {
  if (!window.appAPI?.storage?.initialize) throw new Error("No se pudo iniciar el almacenamiento local.");
  return window.appAPI.storage.initialize();
}

export async function readLocalDatabase() {
  if (!window.appAPI?.database?.read) throw new Error("No se pudo leer la base local.");
  return window.appAPI.database.read();
}

export async function writeLocalDatabase(data) {
  if (!window.appAPI?.database?.write) throw new Error("No se pudo escribir en la base local.");
  return window.appAPI.database.write(data);
}

export async function addLocalLog(message, extra = {}) {
  if (!window.appAPI?.database?.addLog) return null;
  return window.appAPI.database.addLog({ message, extra });
}

export async function addLocalError(message, fileName = "", section = "") {
  if (!window.appAPI?.database?.addError) return null;
  return window.appAPI.database.addError({ message, fileName, section });
}
