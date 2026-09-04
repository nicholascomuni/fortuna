import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  IconUser, IconGlobe, IconDownload, IconUpload,
  IconSun, IconMoon, IconLock, IconCheck, IconAlertTriangle,
} from "../components/Icons";

// ── helpers ───────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center gap-2 pb-1" style={{ borderBottom: "1px solid var(--border)" }}>
        <Icon className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        <h2 style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="grid gap-1.5">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function SaveBtn({ loading, saved, children = "Salvar" }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary text-sm flex items-center gap-2"
      style={{ opacity: loading ? 0.6 : 1 }}
    >
      {saved ? <IconCheck className="w-4 h-4" /> : null}
      {loading ? "Salvando…" : saved ? "Salvo!" : children}
    </button>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", top: "1rem", right: "1rem", zIndex: 50,
      padding: "0.75rem 1rem", borderRadius: "0.75rem",
      boxShadow: "0 10px 15px -3px rgb(0 0 0/.1)",
      fontSize: "0.875rem", fontWeight: 500, color: "#fff",
      backgroundColor: toast.type === "error" ? "#e11d48" : "#059669",
      display: "flex", alignItems: "center", gap: "0.5rem",
    }}>
      {toast.type === "error" ? "✕" : "✓"} {toast.msg}
    </div>
  );
}

function EmailVerifyBanner({ user, showToast }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.email_verified) return null;

  async function handleResend() {
    setSending(true);
    try {
      await api.resendVerification();
      setSent(true);
      showToast("E-mail de verificação reenviado.");
    } catch (err) { showToast(err.message, "error"); }
    finally { setSending(false); }
  }

  return (
    <div style={{
      backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
      borderRadius: "0.75rem", padding: "0.75rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap",
    }}>
      <div className="flex items-center gap-2">
        <IconAlertTriangle className="w-4 h-4" style={{ color: "#b45309", flexShrink: 0 }} />
        <p style={{ color: "#b45309", fontSize: "0.8125rem" }}>Seu e-mail ainda não foi verificado.</p>
      </div>
      <button
        onClick={handleResend}
        disabled={sending || sent}
        className="text-xs font-semibold"
        style={{ color: "#b45309", background: "transparent", border: "none", cursor: sending || sent ? "default" : "pointer", textDecoration: "underline", flexShrink: 0 }}
      >
        {sent ? "Reenviado!" : sending ? "Enviando…" : "Reenviar e-mail"}
      </button>
    </div>
  );
}

// ── tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "perfil",      label: "Perfil",       Icon: IconUser     },
  { id: "preferencias", label: "Preferências", Icon: IconGlobe    },
  { id: "dados",       label: "Dados",        Icon: IconDownload },
];

// ── main page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, setUser } = useAuth();
  const { dark, toggle } = useTheme();

  const [tab, setTab] = useState("perfil");
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Toast toast={toast} />

      <EmailVerifyBanner user={user} showToast={showToast} />

      {/* Header */}
      <div>
        <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Configurações</h1>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
          Gerencie sua conta, preferências e dados
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem", fontWeight: active ? 600 : 400,
                color: active ? "#2563eb" : "var(--text-secondary)",
                borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
                background: "transparent", border: "none",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: active ? "#2563eb" : "transparent",
                cursor: "pointer", transition: "all 0.15s",
                marginBottom: "-1px",
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "perfil"      && <ProfileTab user={user} setUser={setUser} showToast={showToast} />}
      {tab === "preferencias" && <PrefsTab dark={dark} toggle={toggle} showToast={showToast} />}
      {tab === "dados"       && <DataTab showToast={showToast} />}
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, setUser, showToast }) {
  const [name, setName]         = useState(user?.name ?? "");
  const [email, setEmail]       = useState(user?.email ?? "");
  const [loading, setLoading]   = useState(false);
  const [saved, setSaved]       = useState(false);

  const [curPw, setCurPw]       = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confPw, setConfPw]     = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved]   = useState(false);

  async function handleSaveInfo(e) {
    e.preventDefault();
    setLoading(true); setSaved(false);
    try {
      const updated = await api.updateProfile({ name, email });
      setUser(updated);
      setSaved(true);
      showToast("Perfil atualizado!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }

  async function handleSavePw(e) {
    e.preventDefault();
    if (newPw !== confPw) { showToast("As senhas não coincidem.", "error"); return; }
    if (newPw.length < 6) { showToast("Nova senha deve ter ao menos 6 caracteres.", "error"); return; }
    setPwLoading(true); setPwSaved(false);
    try {
      await api.updateProfile({ current_password: curPw, password: newPw });
      setPwSaved(true);
      setCurPw(""); setNewPw(""); setConfPw("");
      showToast("Senha alterada!");
      setTimeout(() => setPwSaved(false), 2000);
    } catch (err) { showToast(err.message, "error"); }
    finally { setPwLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Section title="Informações pessoais" icon={IconUser}>
        <form onSubmit={handleSaveInfo} className="space-y-4">
          <Field label="Nome">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              required className="input" />
          </Field>
          <Field label="E-mail">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required className="input" />
          </Field>
          <div className="flex justify-end">
            <SaveBtn loading={loading} saved={saved} />
          </div>
        </form>
      </Section>

      <Section title="Alterar senha" icon={IconLock}>
        <form onSubmit={handleSavePw} className="space-y-4">
          <Field label="Senha atual">
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)}
              required autoComplete="current-password" className="input" />
          </Field>
          <Field label="Nova senha">
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              required autoComplete="new-password" placeholder="Mínimo 6 caracteres" className="input" />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" value={confPw} onChange={e => setConfPw(e.target.value)}
              required autoComplete="new-password" className="input" />
          </Field>
          <div className="flex justify-end">
            <SaveBtn loading={pwLoading} saved={pwSaved}>Alterar senha</SaveBtn>
          </div>
        </form>
      </Section>

      <TwoFactorSection user={user} setUser={setUser} showToast={showToast} />
    </div>
  );
}

// ── Two-factor authentication section ────────────────────────────────────────

function TwoFactorSection({ user, setUser, showToast }) {
  const [setupData, setSetupData] = useState(null); // null | { secret, qr_code }
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePw, setDisablePw] = useState("");

  async function startSetup() {
    setLoading(true);
    try {
      const data = await api.setup2fa();
      setSetupData(data);
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const updated = await api.enable2fa(code);
      setUser(updated);
      setSetupData(null);
      setCode("");
      showToast("Autenticação em duas etapas ativada!");
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }

  async function confirmDisable(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const updated = await api.disable2fa(disablePw);
      setUser(updated);
      setShowDisable(false);
      setDisablePw("");
      showToast("Autenticação em duas etapas desativada.");
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }

  return (
    <Section title="Autenticação em duas etapas" icon={IconLock}>
      {user?.totp_enabled ? (
        showDisable ? (
          <form onSubmit={confirmDisable} className="space-y-3">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Digite sua senha atual para desativar a autenticação em duas etapas.
            </p>
            <input
              type="password" value={disablePw} onChange={e => setDisablePw(e.target.value)}
              required autoFocus autoComplete="current-password" className="input" placeholder="Senha atual"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowDisable(false); setDisablePw(""); }} className="btn-ghost text-sm" style={{ padding: "0.5rem 1rem" }}>
                Cancelar
              </button>
              <button
                type="submit" disabled={loading}
                className="text-sm"
                style={{ padding: "0.5rem 1rem", borderRadius: "0.75rem", fontWeight: 600, cursor: "pointer", border: "1px solid rgba(225,29,72,0.35)", backgroundColor: "rgba(225,29,72,0.1)", color: "#e11d48" }}
              >
                {loading ? "Desativando…" : "Desativar 2FA"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <IconCheck className="w-4 h-4" style={{ color: "#059669" }} />
              <p style={{ color: "var(--text-base)", fontSize: "0.875rem" }}>Ativada nesta conta.</p>
            </div>
            <button onClick={() => setShowDisable(true)} className="btn-ghost text-sm" style={{ color: "#e11d48" }}>
              Desativar
            </button>
          </div>
        )
      ) : setupData ? (
        <form onSubmit={confirmEnable} className="space-y-4">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Escaneie o QR code com um app autenticador (Google Authenticator, Authy, 1Password, etc.)
            ou digite o código manualmente. Depois confirme com o código de 6 dígitos gerado pelo app.
          </p>
          <div className="flex flex-col items-center gap-3">
            <img
              src={setupData.qr_code} alt="QR code para configurar 2FA"
              style={{ width: "10rem", height: "10rem", borderRadius: "0.75rem", background: "#fff", padding: "0.5rem" }}
            />
            <code style={{ fontSize: "0.75rem", color: "var(--text-muted)", letterSpacing: "0.05em", wordBreak: "break-all", textAlign: "center" }}>
              {setupData.secret}
            </code>
          </div>
          <Field label="Código de 6 dígitos">
            <input
              type="text" inputMode="numeric" maxLength={6} value={code}
              onChange={e => setCode(e.target.value)} required autoFocus className="input"
              placeholder="000000" style={{ textAlign: "center", letterSpacing: "0.2em" }}
            />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setSetupData(null); setCode(""); }} className="btn-ghost text-sm" style={{ padding: "0.5rem 1rem" }}>
              Cancelar
            </button>
            <SaveBtn loading={loading}>Confirmar e ativar</SaveBtn>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Adicione uma camada extra de segurança exigindo um código do seu app autenticador ao entrar.
          </p>
          <button onClick={startSetup} disabled={loading} className="btn-primary text-sm" style={{ flexShrink: 0 }}>
            {loading ? "Carregando…" : "Ativar 2FA"}
          </button>
        </div>
      )}
    </Section>
  );
}

// ── Preferences tab ───────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: "BRL", label: "Real brasileiro (R$)" },
  { code: "USD", label: "Dólar americano ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "Libra esterlina (£)" },
  { code: "ARS", label: "Peso argentino ($)" },
  { code: "CLP", label: "Peso chileno ($)" },
];

const LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "en-US", label: "English (US)" },
  { code: "es",    label: "Español" },
];

function PrefsTab({ dark, toggle, showToast }) {
  const [settings, setSettings] = useState(null);
  const [currency, setCurrency] = useState("BRL");
  const [language, setLanguage] = useState("pt-BR");
  const [loading, setLoading]   = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s);
      setCurrency(s.currency ?? "BRL");
      setLanguage(s.language ?? "pt-BR");
    });
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true); setSaved(false);
    try {
      await api.updateSettings({ currency, language });
      setSaved(true);
      showToast("Preferências salvas!");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Section title="Aparência" icon={dark ? IconMoon : IconSun}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ color: "var(--text-base)", fontSize: "0.875rem", fontWeight: 500 }}>Tema</p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {dark ? "Modo escuro ativado" : "Modo claro ativado"}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.5rem 1rem", borderRadius: "0.75rem",
              fontSize: "0.875rem", fontWeight: 500, cursor: "pointer",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-input)",
              color: "var(--text-base)",
              transition: "all 0.15s",
            }}
          >
            {dark
              ? <><IconSun className="w-4 h-4" /> Modo claro</>
              : <><IconMoon className="w-4 h-4" /> Modo escuro</>
            }
          </button>
        </div>
      </Section>

      <Section title="Regionalização" icon={IconGlobe}>
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Moeda">
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="input">
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Idioma">
            <select value={language} onChange={e => setLanguage(e.target.value)} className="input">
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end">
            <SaveBtn loading={loading} saved={saved} />
          </div>
        </form>
      </Section>
    </div>
  );
}

// ── Data tab ──────────────────────────────────────────────────────────────────

function DataTab({ showToast }) {
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState("merge");
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  async function handleExport() {
    try {
      const data = await api.exportData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href     = url;
      a.download = `financas-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exportação concluída!");
    } catch (err) { showToast(err.message, "error"); }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.importData({ ...data, mode: importMode });
      setImportResult(result);
      showToast(`${result.imported} movimentações importadas!`);
    } catch (err) {
      showToast(err.message || "Arquivo inválido.", "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* Export */}
      <Section title="Exportar dados" icon={IconDownload}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Exporta todas as suas movimentações, configurações e saldo inicial em formato JSON.
          Use esse arquivo para fazer backup ou migrar para outro dispositivo.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <IconDownload className="w-4 h-4" /> Exportar backup
        </button>
      </Section>

      {/* Import */}
      <Section title="Importar dados" icon={IconUpload}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Importa um arquivo de backup exportado anteriormente.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 500 }}>Modo:</span>
          {[
            { v: "merge",   label: "Mesclar",    desc: "Adiciona as movimentações do arquivo sem apagar as existentes" },
            { v: "replace", label: "Substituir", desc: "Apaga todas as movimentações atuais e importa as do arquivo" },
          ].map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setImportMode(opt.v)}
              title={opt.desc}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: "0.75rem",
                fontSize: "0.8125rem",
                fontWeight: importMode === opt.v ? 600 : 400,
                cursor: "pointer",
                border: `1px solid ${importMode === opt.v ? (opt.v === "replace" ? "rgba(225,29,72,0.4)" : "rgba(37,99,235,0.35)") : "var(--border-input)"}`,
                backgroundColor: importMode === opt.v
                  ? (opt.v === "replace" ? "rgba(225,29,72,0.1)" : "rgba(37,99,235,0.09)")
                  : "transparent",
                color: importMode === opt.v
                  ? (opt.v === "replace" ? "#e11d48" : "#2563eb")
                  : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {importMode === "replace" && (
          <div style={{ backgroundColor: "rgba(225,29,72,0.08)", border: "1px solid rgba(225,29,72,0.25)", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.8125rem", color: "#e11d48" }}>
            ⚠️ Atenção: todas as suas movimentações atuais serão apagadas antes da importação.
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            disabled={importing}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="btn-primary text-sm flex items-center gap-2"
            style={{ opacity: importing ? 0.6 : 1 }}
          >
            <IconUpload className="w-4 h-4" />
            {importing ? "Importando…" : "Escolher arquivo"}
          </button>

          {importResult && (
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <strong style={{ color: "#059669" }}>{importResult.imported}</strong> importadas
              {importResult.skipped > 0 && (
                <>, <strong style={{ color: "#f59e0b" }}>{importResult.skipped}</strong> ignoradas</>
              )}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
