import { useEffect, useState } from "react";
import { getAppSettings, saveGeminiKey, testGeminiConnection, generateGeminiTest } from "../../services/settings.service";

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 10) return "Clave guardada";
  return `${key.slice(0, 6)}••••••${key.slice(-4)}`;
}

function AjustesScreen() {
  const [geminiKey, setGeminiKey] = useState("");
  const [savedKeyMask, setSavedKeyMask] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [status, setStatus] = useState("Pendiente");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testText, setTestText] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getAppSettings();
        if (settings.geminiApiKey) {
          setGeminiKey(settings.geminiApiKey);
          setSavedKeyMask(maskKey(settings.geminiApiKey));
          setGeminiModel(settings.geminiModel || "");
          setStatus(settings.geminiStatus === "connected" ? "Gemini conectado" : "Clave guardada");
        }
      } catch {
        setStatus("No se pudieron cargar los ajustes");
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      if (!geminiKey.trim()) return window.alert("Debes ingresar la clave de Gemini.");
      setIsSaving(true);
      setStatus("Guardando clave...");
      await saveGeminiKey(geminiKey.trim());
      setSavedKeyMask(maskKey(geminiKey.trim()));
      setStatus("Clave guardada correctamente");
    } catch (error) {
      window.alert(error.message || "No se pudo guardar la clave.");
      setStatus("Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      if (!geminiKey.trim()) return window.alert("Primero ingresa la clave de Gemini.");
      setIsTesting(true);
      setStatus("Probando conexión con Gemini...");
      setTestText("");
      const result = await testGeminiConnection(geminiKey.trim());
      setGeminiModel(result.model || "");
      setSavedKeyMask(maskKey(geminiKey.trim()));
      setStatus("Gemini conectado correctamente");
      window.alert(`Gemini conectado correctamente. Modelo: ${result.model}`);
    } catch (error) {
      setStatus("No conectado");
      window.alert(error.message || "No se pudo conectar con Gemini.");
    } finally {
      setIsTesting(false);
    }
  };

  const handleGenerateTest = async () => {
    try {
      setIsTesting(true);
      setStatus("Probando generación...");
      const result = await generateGeminiTest();
      setTestText(result.text || "");
      setStatus("Prueba de generación correcta");
    } catch (error) {
      setStatus("Error en generación");
      window.alert(error.message || "Gemini no pudo generar texto.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="screen-card">
      <h2>Ajustes</h2>
      <p>Configura la clave de Gemini.</p>
      <label className="input-label">Clave Gemini<input className="text-input" type="password" placeholder="Pega tu clave aquí" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} /></label>
      <div className="button-row"><button className="primary-button" type="button" onClick={handleSave} disabled={isSaving || isTesting}>{isSaving ? "Guardando..." : "Guardar"}</button><button className="secondary-button" type="button" onClick={handleTestConnection} disabled={isSaving || isTesting}>{isTesting ? "Probando..." : "Probar conexión"}</button><button className="secondary-button" type="button" onClick={handleGenerateTest} disabled={isSaving || isTesting || !geminiModel}>Probar generación</button></div>
      <div className="local-status"><strong>{status}</strong>{savedKeyMask && <span>Clave: {savedKeyMask}</span>}{geminiModel && <span>Modelo: {geminiModel}</span>}<span>El resto de ajustes queda por defecto.</span></div>
      {testText && <div className="preview-box"><h3>Respuesta de Gemini</h3><p>{testText}</p></div>}
    </section>
  );
}

export default AjustesScreen;
