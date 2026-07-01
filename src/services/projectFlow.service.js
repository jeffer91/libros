import { readLocalDatabase } from "./localDatabase.service";

export async function getProjectFlowState() {
  const db = await readLocalDatabase();
  const project = db.currentProject || {};
  const settings = db.settings || {};
  const uploadedFiles = project.uploadedFiles || [];
  const academicSummary = project.academicSummary || null;
  const hasUploadedFiles = uploadedFiles.length === 1 || uploadedFiles.length === 3;
  const hasProcessedData = Boolean(project.processedDataPath);
  const hasAcademicData = Boolean(project.academicDataPath && academicSummary);
  const hasGeminiConnected = settings.geminiStatus === "connected";
  const hasBlockingAcademicErrors = academicSummary && academicSummary.blockersCount > 0;
  const canGenerate = hasUploadedFiles && hasProcessedData && hasAcademicData && hasGeminiConnected && !hasBlockingAcademicErrors;
  return {
    db,
    project,
    settings,
    uploadedFiles,
    academicSummary,
    hasUploadedFiles,
    hasProcessedData,
    hasAcademicData,
    hasGeminiConnected,
    hasBlockingAcademicErrors,
    canGenerateBook: canGenerate,
    canGenerateGuide: canGenerate,
    hasBookFinal: Boolean(project.bookFinalPath),
    hasGuideFinal: Boolean(project.guideFinalPath)
  };
}

export function getSemaforoFromState(state) {
  if (!state.hasUploadedFiles) return { color: "rojo", label: "Rojo", message: "Primero debes cargar los Excel." };
  if (!state.hasProcessedData) return { color: "rojo", label: "Rojo", message: "Primero debes procesar los Excel." };
  if (!state.hasAcademicData) return { color: "rojo", label: "Rojo", message: "Primero debes crear la estructura académica." };
  if (!state.hasGeminiConnected) return { color: "rojo", label: "Rojo", message: "Primero debes conectar Gemini en Ajustes." };
  if (state.academicSummary?.blockersCount > 0) return { color: "rojo", label: "Rojo", message: "Hay errores importantes que impiden continuar." };
  if (state.academicSummary?.warningsCount > 0) return { color: "amarillo", label: "Amarillo", message: "Se puede continuar, pero hay advertencias." };
  return { color: "verde", label: "Verde", message: "La estructura está lista para generar documentos." };
}
