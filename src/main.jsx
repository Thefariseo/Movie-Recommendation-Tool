// =====================================================
// File: src/main.jsx
// Description: Application entry point, React 18 root.
// =====================================================
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { registerServiceWorker } from "./utils/notifications";
import { startTranslation } from "./i18n";
//import "/src/index.css";  

// The dictionary loads before the first render, so the page never flashes in English.
startTranslation().catch(() => {}).finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});

if (import.meta.env.PROD) registerServiceWorker();
