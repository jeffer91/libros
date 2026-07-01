import { useEffect, useRef, useState } from "react";
import { initializeLocalStorage, readLocalDatabase, addLocalLog, addLocalError } from "../../services/localDatabase.service";
import { saveExcelFiles } from "../../services/fileUpload.service";
import FileCard from "../../components/upload/FileCard";

function CargaScreen() {
  const inputRef = useRef(null);
  const [storageStatus, setStorageStatus] = useState("Verificando...");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [mode, setMode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Sin archivos cargados");

  useEffect(() => {
    async function prepareStorage() {
      try {
        const storage = await initializeLocalStorage();
        const db = await readLocalDatabase();
        await addLocalLog("Carga lista", { screen: "Carga" });
        setUploadedFiles(db.currentProject?.uploadedFiles || []);
        setMode(db.currentProject?.mode || "");
        setStorageStatus(storage.ok ? "Base local activa" : "Base local pendiente");
      } catch {
        setStorageStatus("Error en base local");
      }
    }
    prepareStorage();
  }, []);

  const showError = async (errorMessage) => {
    setMessage(errorMessage);
    await addLocalError(errorMessage, "Carga de Excel", "Carga");
    window.alert(errorMessage);
  };

  const handleFiles = async (files) => {
    try {
      setIsLoading(true);
      setMessage("Guardando Excel...");
      const result = await saveExcelFiles(files);
      setUploadedFiles(result.files || []);
      setMode(result.mode || "");
      setMessage("Excel cargado correctamente");
    } catch (error) {
      await showError(error.message || "No se pudieron cargar los Excel.");
    } finally {
      setIsLoading(false);
    }
  };

  const modeLabel = mode === "one-excel-three-sheets" ? "1 Excel con 3 hojas" : mode === "three-excel-files" ? "3 Excel separados" : "Pendiente";

  return (
    <section className="screen-card">
      <h2>Carga</h2>
      <p>Sube 1 Excel con 3 hojas o 3 Excel separados.</p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden-input" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      <div className={isLoading ? "drop-zone loading" : "drop-zone"} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()}>
        <span>{isLoading ? "Guardando..." : "Arrastra o selecciona Excel"}</span>
      </div>
      <div className="local-status">
        <strong>{storageStatus}</strong>
        <span>{message}</span>
        <span>Modo: {modeLabel}</span>
      </div>
      {uploadedFiles.length > 0 && <div className="file-list">{uploadedFiles.map((file) => <FileCard key={file.savedName} file={file} />)}</div>}
    </section>
  );
}

export default CargaScreen;
