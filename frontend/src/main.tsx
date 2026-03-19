import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

console.log("[main.tsx] File loaded");

const rootElement = document.getElementById("root") as HTMLElement;
console.log("[main.tsx] Root element:", rootElement);

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
  console.log("[main.tsx] Render called successfully");
} catch (e) {
  console.error("[main.tsx] Render Error:", e);
}

