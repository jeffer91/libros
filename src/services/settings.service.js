import { readLocalDatabase } from "./localDatabase.service";

export async function getAppSettings() {
  const db = await readLocalDatabase();
  return db.settings || {};
}

export async function saveGeminiKey(geminiApiKey) {
  if (!window.appAPI?.settings?.updateGeminiKey) throw new Error("No se pudo guardar la clave de Gemini.");
  return window.appAPI.settings.updateGeminiKey(geminiApiKey);
}

export async function testGeminiConnection(geminiApiKey) {
  if (!window.appAPI?.settings?.testGeminiConnection) throw new Error("No se pudo probar la conexión con Gemini.");
  return window.appAPI.settings.testGeminiConnection(geminiApiKey);
}

export async function generateGeminiTest() {
  if (!window.appAPI?.gemini?.generateTest) throw new Error("No se pudo hacer la prueba de generación con Gemini.");
  return window.appAPI.gemini.generateTest();
}
