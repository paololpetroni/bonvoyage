import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth.jsx";
import { PersonalProvider } from "./lib/personal.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PersonalProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </PersonalProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
