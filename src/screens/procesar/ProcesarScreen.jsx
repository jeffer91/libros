import { useEffect, useState } from "react";
import { readLocalDatabase, addLocalError } from "../../services/localDatabase.service";
import { analyzeUploadedExcelFiles } from "../../services/fileUpload.service";
import { buildAcademicStructure } from "../../services/academic.service";

function ProcesarScreen() {
  const [uploadedCount, setUploadedCount] = useState(0);
  const [summary, setSummary] = useState(null);
  const [academicSummary, setAcademicSummary] = useState(null);
  const [classification, setClassification] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBuildingAcademic, setIsBuildingAcademic] = useState(false);
  const [message, setMessage] = useState("Pendiente");

  useEffect(() => {
    async function loadCurrentState() {
      try {
        const db = await readLocalDatabase();
        setUploadedCount(db.currentProject?.uploadedFiles?.length || 0);
        setSummary(db.currentProject?.analysisSummary || null);
        setAcademicSummary(db.currentProject?.academicSummary || null);
      } catch {
        setMessage("No se pudo leer la base local.");
      }
    }
    loadCurrentState();
  }, []);

  const handleProcess = async () => {
    try {
      setIsProcessing(true);
      setMessage("Procesando Excel...");
      const result = await analyzeUploadedExcelFiles();
      setSummary(result.summary);
      setClassification(result.classification);
      setAcademicSummary(null);
      setMessage("Excel procesados correctamente");
    } catch (error) {
      const errorMessage = error.message || "No se pudieron procesar los Excel.";
      setMessage(errorMessage);
      await addLocalError(errorMessage, "Excel", "Procesar");
      window.alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBuildAcademic = async () => {
    try {
      setIsBuildingAcademic(true);
      setMessage("Creando estructura académica...");
      const result = await buildAcademicStructure();
      setAcademicSummary(result.summary);
      setMessage("Estructura académica lista");
    } catch (error) {
      const errorMessage = error.message || "No se pudo crear la estructura académica.";
      setMessage(errorMessage);
      await addLocalError(errorMessage, "Motor académico", "Procesar");
      window.alert(errorMessage);
    } finally {
      setIsBuildingAcademic(false);
    }
  };

  return (
    <section className="screen-card">
      <h2>Procesar</h2>
      <p>Lectura inteligente y estructura académica.</p>
      <div className="action-row">
        <button className="primary-button" type="button" onClick={handleProcess} disabled={isProcessing || uploadedCount === 0}>{isProcessing ? "Procesando..." : "Procesar Excel"}</button>
        <button className="secondary-button" type="button" onClick={handleBuildAcademic} disabled={isBuildingAcademic || !summary}>{isBuildingAcademic ? "Organizando..." : "Crear estructura"}</button>
        <span className="small-status">Archivos: {uploadedCount}</span>
      </div>
      <div className="local-status"><strong>{message}</strong><span>Primero procesa el Excel y luego crea la estructura académica.</span></div>
      {summary && <div className="analysis-grid"><div className="analysis-card"><span>Asignatura</span><strong>{summary.subject || "No detectada"}</strong></div><div className="analysis-card"><span>Unidades</span><strong>{summary.unitsCount}</strong></div><div className="analysis-card"><span>Actividades</span><strong>{summary.activitiesCount}</strong></div><div className="analysis-card"><span>Referencias</span><strong>{summary.referencesCount}</strong></div></div>}
      {academicSummary && <div className="analysis-grid"><div className="analysis-card"><span>Competencias</span><strong>{academicSummary.competenciesCount}</strong></div><div className="analysis-card"><span>Resultados</span><strong>{academicSummary.outcomesCount}</strong></div><div className="analysis-card"><span>Talleres</span><strong>{academicSummary.workshopsCount}</strong></div><div className="analysis-card"><span>Estado</span><strong>{academicSummary.blockersCount > 0 ? "Con bloqueos" : "Listo"}</strong></div></div>}
      {classification && <div className="detected-list"><h3>Hojas reconocidas</h3><div><strong>Base PEA:</strong> {classification.basePea.fileName} / {classification.basePea.sheetName}</div><div><strong>Unidades:</strong> {classification.unidades.fileName} / {classification.unidades.sheetName}</div><div><strong>Actividades:</strong> {classification.actividades.fileName} / {classification.actividades.sheetName}</div></div>}
    </section>
  );
}

export default ProcesarScreen;
