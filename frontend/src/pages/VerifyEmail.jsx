import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { IconFortuna, IconCheck, IconX, IconSun, IconMoon } from "../components/Icons";

export default function VerifyEmail() {
  const { dark, toggle } = useTheme();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [message, setMessage] = useState("Verificando…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Link de verificação inválido.");
      return;
    }
    api.verifyEmail(token)
      .then(() => { setStatus("ok"); setMessage("E-mail verificado com sucesso!"); })
      .catch(err => { setStatus("error"); setMessage(err.message); });
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-base)" }} className="flex items-center justify-center p-4">
      <button onClick={toggle} className="fixed top-4 right-4 btn-ghost p-2 rounded-xl" title={dark ? "Modo claro" : "Modo escuro"}>
        {dark ? <IconSun className="w-5 h-5 text-amber-400" /> : <IconMoon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-sm text-center">
        <IconFortuna className="w-14 h-14 mx-auto mb-4 block" />

        <div className="card p-6">
          {status === "loading" && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{message}</p>
          )}
          {status === "ok" && (
            <div className="flex flex-col items-center gap-2">
              <div style={{ width: "3rem", height: "3rem", borderRadius: "9999px", backgroundColor: "rgba(5,150,105,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconCheck className="w-6 h-6" style={{ color: "#059669" }} />
              </div>
              <p style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>{message}</p>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center gap-2">
              <div style={{ width: "3rem", height: "3rem", borderRadius: "9999px", backgroundColor: "rgba(225,29,72,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconX className="w-6 h-6" style={{ color: "#e11d48" }} />
              </div>
              <p style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>{message}</p>
            </div>
          )}
          <Link to="/" className="text-blue-600 hover:underline font-medium text-sm mt-4 inline-block">
            Ir para o app
          </Link>
        </div>
      </div>
    </div>
  );
}
