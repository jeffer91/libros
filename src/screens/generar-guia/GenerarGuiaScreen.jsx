import { useEffect, useState } from "react";
import { getProjectFlowState } from "../../services/projectFlow.service";

function GenerarGuiaScreen() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("Revisando estado...");

  useEffect(() => {
    async function loadState() {
      try {
        const flowState = await getProjectFlowState();
        setState(flowState);
        if (!flowState.hasUploadedFiles) return setMessage("Primero carga los Excel.");
        if (!flowState.hasProcessedData) return setMessage("Primero procesa los Excel.");
        if (!flowState.hasAcademicData) return setMessage("Primero crea la estructura académica.");
        if (!flowState.hasGeminiConnected) return setMessage("Primero conecta Gemini en Ajustes.");
        setMessage("Listo para el bloque de generación de la guía.");
      } catch {
        setMessage("No se pudo revisar el estado.");
      }
    }
    loadState();
  }, []);

  return (
    <section className="screen-card">
      <h2>Generar guía</h2>
      <p>Generación de guía de formación práctica.</p>
      <button className="primary-button" type="button" disabled={!state?.canGenerateGuide} onClick={() => window.alert("La generación real de la guía se implementa en el Bloque 8.")}>Generar guía</button>
      <div className="local-status"><strong>{message}</strong>{state?.academicSummary && <><span>Asignatura: {state.academicSummary.subject || "Sin nombre"}</span><span>Talleres: {state.academicSummary.workshopsCount}</span><span>Referencias: {state.academicSummary.referencesCount}</span></>}</div>
    </section>
  );
}

export default GenerarGuiaScreen;
