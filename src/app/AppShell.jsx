import { useState } from "react";
import MainLayout from "../components/layout/MainLayout";

import CargaScreen from "../screens/carga/CargaScreen";
import ProcesarScreen from "../screens/procesar/ProcesarScreen";
import GenerarLibroScreen from "../screens/generar-libro/GenerarLibroScreen";
import GenerarGuiaScreen from "../screens/generar-guia/GenerarGuiaScreen";
import VerificarScreen from "../screens/verificar/VerificarScreen";
import DescargarScreen from "../screens/descargar/DescargarScreen";
import AjustesScreen from "../screens/ajustes/AjustesScreen";

function AppShell() {
  const [activeScreen, setActiveScreen] = useState("carga");

  const renderScreen = () => {
    switch (activeScreen) {
      case "carga":
        return <CargaScreen />;
      case "procesar":
        return <ProcesarScreen />;
      case "generar-libro":
        return <GenerarLibroScreen />;
      case "generar-guia":
        return <GenerarGuiaScreen />;
      case "verificar":
        return <VerificarScreen />;
      case "descargar":
        return <DescargarScreen />;
      case "ajustes":
        return <AjustesScreen />;
      default:
        return <CargaScreen />;
    }
  };

  return (
    <MainLayout activeScreen={activeScreen} onChangeScreen={setActiveScreen}>
      {renderScreen()}
    </MainLayout>
  );
}

export default AppShell;
