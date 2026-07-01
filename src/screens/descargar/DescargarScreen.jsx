import { useEffect, useState } from "react";
import { getProjectFlowState, getSemaforoFromState } from "../../services/projectFlow.service";

function DescargarScreen() {
  const [state, setState] = useState(null);
  const [semaforo, setSemaforo] = useState(null);

  useEffect(() => {
    async function loadDownloadState() {
      try {
        const flowState = await getProjectFlowState();
        setState(flowState);
        setSemaforo(getSemaforoFromState(flowState));
      } catch {
        setSemaforo({ color: "rojo", label: "Rojo", message: "No se pudo revisar la descarga." });
      }
    }
    loadDownloadState();
  }, []);

  return (
    <section className="screen-card">
      <h2>Descargar Word</h2>
      <p>Descarga libro o guía cuando estén generados.</p>
      {semaforo && <div className={`semaforo-card ${semaforo.color}`}><strong>{semaforo.label}</strong><span>{semaforo.message}</span></div>}
      <div className="download-list">
        <div className="download-card"><div><strong>Libro</strong><span>{state?.hasBookFinal ? "Word listo" : "Sin Word generado"}</span></div><button className="primary-button" type="button" disabled={!state?.hasBookFinal}>Descargar</button></div>
        <div className="download-card"><div><strong>Guía</strong><span>{state?.hasGuideFinal ? "Word listo" : "Sin Word generado"}</span></div><button className="primary-button" type="button" disabled={!state?.hasGuideFinal}>Descargar</button></div>
      </div>
    </section>
  );
}

export default DescargarScreen;
