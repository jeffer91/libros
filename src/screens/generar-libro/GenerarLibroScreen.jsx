import { useEffect, useState } from "react";
import { getProjectFlowState } from "../../services/projectFlow.service";
import { generateBookDraft } from "../../services/bookGeneration.service";
import { addLocalError } from "../../services/localDatabase.service";

function GenerarLibroScreen() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("Revisando estado...");
  const [isGenerating, setIsGenerating] = useState(false);
  const [bookSummary, setBookSummary] = useState(null);

  async function loadState() {
    try {
      const flowState = await getProjectFlowState();
      setState(flowState);
      if (!flowState.hasUploadedFiles) return setMessage("Primero carga los Excel.");
      if (!flowState.hasProcessedData) return setMessage("Primero procesa los Excel.");
      if (!flowState.hasAcademicData) return setMessage("Primero crea la estructura académica.");
      if (!flowState.hasGeminiConnected) return setMessage("Primero conecta Gemini en Ajustes.");
      if (flowState.hasBlockingAcademicErrors) return setMessage("Hay bloqueos académicos. Revisa antes de generar.");
      setMessage("Listo para generar el borrador base del libro.");
    } catch {
      setMessage("No se pudo revisar el estado.");
    }
  }

  useEffect(() => { loadState(); }, []);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setMessage("Generando libro con Gemini...");
      const result = await generateBookDraft();
      setBookSummary(result.summary);
      setMessage("Borrador base del libro generado correctamente.");
      await loadState();
    } catch (error) {
      const errorMessage = error.message || "No se pudo generar el libro.";
      setMessage(errorMessage);
      await addLocalError(errorMessage, "Gemini / Libro", "Generar libro");
      window.alert(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="screen-card">
      <h2>Generar libro</h2>
      <p>Generación académica base del libro.</p>
      <button className="primary-button" type="button" disabled={!state?.canGenerateBook || isGenerating} onClick={handleGenerate}>{isGenerating ? "Generando..." : "Generar libro"}</button>
      <div className="local-status"><strong>{message}</strong>{state?.academicSummary && <><span>Asignatura: {state.academicSummary.subject || "Sin nombre"}</span><span>Unidades: {state.academicSummary.unitsCount}</span><span>Referencias detectadas: {state.academicSummary.referencesCount}</span></>}</div>
      {isGenerating && <div className="generation-progress"><strong>Proceso</strong><span>1. Validando estructura académica</span><span>2. Enviando contenido a Gemini</span><span>3. Organizando unidades del libro</span><span>4. Guardando borrador temporal</span></div>}
      {bookSummary && <div className="analysis-grid"><div className="analysis-card"><span>Libro</span><strong>{bookSummary.subject}</strong></div><div className="analysis-card"><span>Unidades generadas</span><strong>{bookSummary.unitsCount}</strong></div><div className="analysis-card"><span>Tablas sugeridas</span><strong>{bookSummary.tablesSuggested}</strong></div><div className="analysis-card"><span>Figuras sugeridas</span><strong>{bookSummary.figuresSuggested}</strong></div></div>}
    </section>
  );
}

export default GenerarLibroScreen;
