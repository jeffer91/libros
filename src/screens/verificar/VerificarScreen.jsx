import { useEffect, useState } from "react";
import { getProjectFlowState, getSemaforoFromState } from "../../services/projectFlow.service";

function VerificarScreen() {
  const [state, setState] = useState(null);
  const [semaforo, setSemaforo] = useState({ color: "neutral", label: "Pendiente", message: "Revisando..." });

  useEffect(() => {
    async function loadVerification() {
      try {
        const flowState = await getProjectFlowState();
        setState(flowState);
        setSemaforo(getSemaforoFromState(flowState));
      } catch {
        setSemaforo({ color: "rojo", label: "Rojo", message: "No se pudo verificar el proyecto." });
      }
    }
    loadVerification();
  }, []);

  return (
    <section className="screen-card">
      <h2>Verificar</h2>
      <p>Revisión final antes de generar o descargar.</p>
      <div className={`semaforo-card ${semaforo.color}`}><strong>{semaforo.label}</strong><span>{semaforo.message}</span></div>
      {state?.academicSummary && <div className="analysis-grid"><div className="analysis-card"><span>Asignatura</span><strong>{state.academicSummary.subject || "Sin nombre"}</strong></div><div className="analysis-card"><span>Unidades</span><strong>{state.academicSummary.unitsCount}</strong></div><div className="analysis-card"><span>Advertencias</span><strong>{state.academicSummary.warningsCount}</strong></div><div className="analysis-card"><span>Bloqueos</span><strong>{state.academicSummary.blockersCount}</strong></div></div>}
    </section>
  );
}

export default VerificarScreen;
