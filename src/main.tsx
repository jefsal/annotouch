import "./styles/tailwind.css";
import "./style.css";
import { render } from "preact";
import { App } from "./components/App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("missing #app mount element");
}

render(<App root={root} />, root);
