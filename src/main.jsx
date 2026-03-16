import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";
import "./styles/layout.css";
import "./styles/cards.css";
import "./styles/modals.css";
import "./styles/wizard.css";
import "./styles/toast.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
