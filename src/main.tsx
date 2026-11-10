import "./styles/tailwind.css";
import "./style.css";
import { render } from "preact";
import { isDemoMode } from "./app/demo";
import { App } from "./components/App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("missing #app mount element");
}

render(<App root={root} demo={isDemoMode(window.location.search)} />, root);
