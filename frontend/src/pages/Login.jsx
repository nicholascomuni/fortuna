import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { IconDollarSign, IconSun, IconMoon } from "../components/Icons";

export default function Login() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-base)" }} className="flex items-center justify-center p-4">
      <button onClick={toggle} className="fixed top-4 right-4 btn-ghost p-2 rounded-xl" title={dark ? "Modo claro" : "Modo escuro"}>
        {dark ? <IconSun className="w-5 h-5 text-amber-400" /> : <IconMoon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <IconDollarSign className="w-7 h-7 text-white stroke-white" />
          </div>
          <h1 style={{ color: "var(--text-base)" }} className="text-2xl font-bold">Bem-vindo de volta</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-1">Entre na sua conta</p>
        </div>

        <div className="card p-6">
          {error && (
            <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem", marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="seu@email.com" required autoFocus className="input" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required className="input" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p style={{ color: "var(--text-secondary)" }} className="text-center text-sm mt-5">
            Não tem conta?{" "}
            <Link to="/cadastro" className="text-blue-600 hover:underline font-medium">Cadastre-se</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
