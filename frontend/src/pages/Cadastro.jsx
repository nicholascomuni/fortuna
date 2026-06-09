import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { IconDollarSign, IconSun, IconMoon } from "../components/Icons";

export default function Cadastro() {
  const { register } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    if (form.password !== form.confirm) { setErrors(["As senhas não coincidem."]); return; }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate("/");
    } catch (err) {
      setErrors([err.message]);
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
          <h1 style={{ color: "var(--text-base)" }} className="text-2xl font-bold">Criar conta</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-1">Comece a controlar suas finanças</p>
        </div>

        <div className="card p-6">
          {errors.length > 0 && (
            <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem", marginBottom: "1rem" }}>
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { field: "name",     label: "Nome",            type: "text",     placeholder: "Seu nome completo" },
              { field: "email",    label: "E-mail",          type: "email",    placeholder: "seu@email.com" },
              { field: "password", label: "Senha",           type: "password", placeholder: "Mínimo 6 caracteres" },
              { field: "confirm",  label: "Confirmar senha", type: "password", placeholder: "Repita a senha" },
            ].map(({ field, label, type, placeholder }) => (
              <div key={field}>
                <label className="label">{label}</label>
                <input type={type} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={placeholder} required autoFocus={field === "name"} className="input" />
              </div>
            ))}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? "Criando conta..." : "Criar conta"}
            </button>
          </form>

          <p style={{ color: "var(--text-secondary)" }} className="text-center text-sm mt-5">
            Já tem conta?{" "}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
