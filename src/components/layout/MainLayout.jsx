import TopMenu from "./TopMenu";
import { APP_NAME } from "../../app/app.constants";

function MainLayout({ activeScreen, onChangeScreen, children }) {
  return (
    <div className="main-layout">
      <header className="app-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p>Libros y guías desde Excel</p>
        </div>
      </header>
      <TopMenu activeScreen={activeScreen} onChangeScreen={onChangeScreen} />
      <main className="screen-container">{children}</main>
    </div>
  );
}

export default MainLayout;
