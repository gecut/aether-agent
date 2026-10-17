import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopWidget } from "./widget/DesktopWidget";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("widget") === "1" ? (
      <DesktopWidget />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
