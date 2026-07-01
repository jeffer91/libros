export async function buildAcademicStructure() {
  if (!window.appAPI?.academic?.buildStructure) {
    throw new Error("No se pudo crear la estructura académica.");
  }
  return window.appAPI.academic.buildStructure();
}
