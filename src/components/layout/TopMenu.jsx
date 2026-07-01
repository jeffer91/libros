import { MENU_ITEMS } from "../../app/app.constants";

function TopMenu({ activeScreen, onChangeScreen }) {
  return (
    <nav className="top-menu">
      {MENU_ITEMS.map((item) => (
        <button
          key={item.id}
          className={activeScreen === item.id ? "menu-button active" : "menu-button"}
          onClick={() => onChangeScreen(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export default TopMenu;
