import { useState, useEffect, useRef, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../api/client";
import { relativeLabel } from "../utils/format";
import GlobalQuickAdd from "./GlobalQuickAdd";
import AiChatWidget from "./AiChatWidget";
import PlanShareModal from "./PlanShareModal";
import {
  IconChart, IconRepeat, IconFlask,
  IconSun, IconMoon, IconLogOut, IconFortuna, IconBarChart, IconCreditCard,
  IconWallet, IconChevronDown, IconPlus, IconCheck, IconMenu, IconX, IconUserCircle,
  IconSparkles, IconCopy, IconShare, IconTrash, IconAlertTriangle, IconEdit,
} from "./Icons";

// ── AI conversation-history sidebar — a second nav column, populated by the
// /assistente page itself (EXPERIMENTAL: Claude/ChatGPT-style "glued to the
// menu" layout test, replacing the page's own side-by-side sidebar) ────────

const AiSidebarContext = createContext(null);
export function useAiSidebar() {
  return useContext(AiSidebarContext);
}

// "Configurações" isn't listed here anymore — the profile icon in the header
// is the entry point for it now (see ProfileLink below).
const navItems = [
  { to: "/",             label: "Dashboard",   Icon: IconChart      },
  { to: "/assistente",   label: "Assistente",  Icon: IconSparkles   },
  { to: "/recorrentes",  label: "Recorrentes", Icon: IconRepeat     },
  { to: "/contas",       label: "Contas",      Icon: IconWallet     },
  { to: "/cartoes",      label: "Cartões",     Icon: IconCreditCard },
  { to: "/relatorios",   label: "Relatórios",  Icon: IconBarChart   },
  { to: "/simulador",    label: "Simulador",   Icon: IconFlask      },
];

// ── Plan switcher — discreet dropdown, current plan name + chevron ──────────

// A plan sitting inside an <aside> with position:sticky is nested in its own
// stacking context — z-index alone can't make a dropdown/modal painted
// there escape above sibling content (the dashboard chart, the assistant
// page's second sidebar) that happens to paint later in the DOM. Portaling
// straight to document.body sidesteps that entirely; DeletePlanModal below
// and PlanShareModal both do the same for the same reason.
function DeletePlanModal({ plan, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (confirmText !== "DELETAR" || busy) return;
    setError("");
    setBusy(true);
    try {
      await api.deletePlan(plan.id);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
    >
      <div onClick={e => e.stopPropagation()} className="card w-full max-w-sm p-6" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)" }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div style={{ width: "2rem", height: "2rem", borderRadius: "0.625rem", flexShrink: 0, backgroundColor: "rgba(225,29,72,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconAlertTriangle className="w-4 h-4" style={{ color: "#e11d48" }} />
          </div>
          <h2 style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem", wordBreak: "break-word" }}>
            Excluir "{plan.name}"?
          </h2>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.5, marginBottom: "1rem" }}>
          Isso apaga contas, cartões, lançamentos e compras desse plano permanentemente. Essa ação não pode ser desfeita.
        </p>
        <label className="label">Digite <strong>DELETAR</strong> para confirmar</label>
        <input
          autoFocus
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleDelete(); }}
          className="input"
          style={{ marginBottom: "0.75rem" }}
        />
        {error && (
          <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.625rem 0.75rem", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm" style={{ padding: "0.5rem 1rem" }}>Cancelar</button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== "DELETAR" || busy}
            style={{
              padding: "0.5rem 1.125rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 600, border: "none", color: "#fff",
              backgroundColor: "#e11d48", cursor: (confirmText !== "DELETAR" || busy) ? "not-allowed" : "pointer",
              opacity: confirmText !== "DELETAR" ? 0.5 : 1,
            }}
          >
            {busy ? "Excluindo…" : "Excluir plano"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PlanSwitcher({ user }) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState(null);
  const [plans, setPlans] = useState(null);
  const [shared, setShared] = useState(null);
  const [sharingPlan, setSharingPlan] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openMenu() {
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
    api.getPlans().then(setPlans).catch(() => setPlans([]));
    api.getSharedPlans().then(setShared).catch(() => setShared([]));
  }

  async function activate(plan) {
    if (plan.is_active || busy) return;
    setBusy(true);
    try {
      await api.activatePlan(plan.id);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  async function duplicate(plan) {
    if (busy) return;
    setBusy(true);
    try {
      await api.duplicatePlan(plan.id);
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  async function createPlan(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.createPlan({ name });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  function startRename(plan) {
    setRenamingId(plan.id);
    setRenameValue(plan.name);
  }

  async function commitRename(plan) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === plan.name || busy) return;
    setBusy(true);
    try {
      await api.updatePlan(plan.id, { name });
      setPlans(prev => prev.map(p => (p.id === plan.id ? { ...p, name } : p)));
    } finally {
      setBusy(false);
    }
  }

  if (!user?.active_plan) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="btn-ghost text-xs flex items-center gap-1"
        style={{ padding: "0.375rem 0.625rem", color: "var(--text-secondary)" }}
        title="Trocar plano de contas"
      >
        {user.active_plan.name}
        <IconChevronDown className="w-3 h-3" />
      </button>

      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 100,
            width: "16rem", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "0.75rem", boxShadow: "0 10px 25px -5px rgb(0 0 0/.15)", overflow: "hidden",
          }}
        >
          <div style={{ padding: "0.5rem" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.25rem 0.5rem" }}>
              Planos de contas
            </p>
            {plans === null ? (
              <p style={{ padding: "0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>Carregando…</p>
            ) : (
              plans.map(plan => (
                <div key={plan.id} style={{ display: "flex", alignItems: "center", gap: "0.125rem" }}>
                  <div
                    onClick={() => activate(plan)}
                    style={{
                      flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.375rem",
                      padding: "0.5rem 0.625rem", borderRadius: "0.5rem", fontSize: "0.8125rem",
                      fontWeight: plan.is_active ? 600 : 400,
                      color: plan.is_active ? "#2563eb" : "var(--text-base)",
                      background: plan.is_active ? "rgba(37,99,235,0.08)" : "transparent",
                      cursor: busy ? "default" : "pointer", textAlign: "left",
                    }}
                    onMouseEnter={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "var(--bg-muted)"; }}
                    onMouseLeave={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    {renamingId === plan.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(plan)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitRename(plan);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="input"
                        style={{ flex: 1, fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
                      />
                    ) : (
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {plan.name}
                      </span>
                    )}
                    {plan.is_active && renamingId !== plan.id && <IconCheck className="w-3.5 h-3.5" style={{ flexShrink: 0 }} />}
                  </div>
                  {renamingId !== plan.id && (
                    <button
                      onClick={e => { e.stopPropagation(); startRename(plan); }}
                      disabled={busy}
                      title="Renomear plano"
                      style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--bg-muted)"; e.currentTarget.style.color = "var(--text-base)"; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                    >
                      <IconEdit className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => duplicate(plan)}
                    disabled={busy}
                    title="Duplicar plano"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--bg-muted)"; e.currentTarget.style.color = "var(--text-base)"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <IconCopy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSharingPlan(plan)}
                    disabled={busy}
                    title="Compartilhar plano"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--bg-muted)"; e.currentTarget.style.color = "var(--text-base)"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <IconShare className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingPlan(plan)}
                    disabled={busy}
                    title="Excluir plano"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; e.currentTarget.style.color = "#e11d48"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {shared !== null && shared.length > 0 && (
            <div style={{ padding: "0.5rem", borderTop: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.25rem 0.5rem" }}>
                Compartilhados
              </p>
              {shared.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => activate(plan)}
                  disabled={busy}
                  title={`Compartilhado por ${plan.owner_name} · ${plan.permission === "edit" ? "edição" : "leitura"}`}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.375rem",
                    padding: "0.5rem 0.625rem", borderRadius: "0.5rem", fontSize: "0.8125rem",
                    fontWeight: plan.is_active ? 600 : 400,
                    color: plan.is_active ? "#2563eb" : "var(--text-base)",
                    background: plan.is_active ? "rgba(37,99,235,0.08)" : "transparent",
                    border: "none", cursor: busy ? "default" : "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "var(--bg-muted)"; }}
                  onMouseLeave={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden" }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.name}</span>
                    <span style={{ display: "block", fontSize: "0.7rem", fontWeight: 400, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {plan.owner_name} · {plan.permission === "edit" ? "edição" : "leitura"}
                    </span>
                  </span>
                  {plan.is_active && <IconCheck className="w-3.5 h-3.5" style={{ flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={createPlan} style={{ borderTop: "1px solid var(--border)", padding: "0.5rem", display: "flex", gap: "0.375rem" }}>
            <input
              type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Novo plano de contas…" className="input" style={{ fontSize: "0.8125rem", padding: "0.375rem 0.625rem" }}
            />
            <button type="submit" disabled={busy || !newName.trim()} className="btn-ghost p-1.5 rounded-lg" style={{ border: "1px solid var(--border)", flexShrink: 0 }} title="Criar">
              <IconPlus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>,
        document.body
      )}

      {sharingPlan && (
        <PlanShareModal plan={sharingPlan} onClose={() => setSharingPlan(null)} />
      )}
      {deletingPlan && (
        <DeletePlanModal
          plan={deletingPlan}
          onClose={() => setDeletingPlan(null)}
          onDeleted={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// ── Profile — icon + first name, links to Configurações ─────────────────────

function ProfileLink({ user }) {
  if (!user) return null;
  return (
    <NavLink
      to="/configuracoes"
      className={({ isActive }) =>
        `flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full transition-all ${
          isActive
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`
      }
      title="Configurações da conta"
    >
      <IconUserCircle className="w-5 h-5" />
      <span className="text-xs font-medium hidden sm:inline">{user.name.split(" ")[0]}</span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiSidebar, setAiSidebar] = useState(null);
  const onAssistantPage = location.pathname === "/assistente";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  const sidebarLinkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  return (
    <AiSidebarContext.Provider value={setAiSidebar}>
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }} className="flex">

      {/* ── Sidebar — desktop/tablet only (EXPERIMENTAL: left-side nav test) ── */}
      <aside
        className="hidden md:flex md:flex-col"
        style={{
          width: "15rem", flexShrink: 0, borderRight: "1px solid var(--border)",
          backgroundColor: "var(--bg-header)", position: "sticky", top: 0, height: "100vh",
        }}
      >
        <NavLink to="/" className="flex items-center gap-2 px-4 shrink-0" style={{ height: "3.5rem", borderBottom: "1px solid var(--border)" }}>
          <IconFortuna className="w-7 h-7 block" />
          <span style={{ color: "var(--text-primary)" }} className="font-bold text-sm tracking-tight">
            Fortuna
          </span>
        </NavLink>

        <div className="px-3 py-3 shrink-0">
          <PlanSwitcher user={user} />
        </div>

        <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className={sidebarLinkClass}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 flex flex-col gap-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <ProfileLink user={user} />
            <div className="flex items-center gap-1">
              <button
                onClick={toggle}
                className="btn-ghost p-2 rounded-xl"
                title={dark ? "Modo claro" : "Modo escuro"}
              >
                {dark
                  ? <IconSun className="w-4 h-4 text-amber-400" />
                  : <IconMoon className="w-4 h-4" />
                }
              </button>
              <button
                onClick={handleLogout}
                className="btn-ghost p-2 rounded-xl"
                title="Sair"
                style={{ color: "var(--text-muted)" }}
              >
                <IconLogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── AI conversation history — glued to the nav, second column, only
          on /assistente (EXPERIMENTAL: Claude/ChatGPT-style layout test) ── */}
      {aiSidebar && (
        <aside
          className="hidden md:flex md:flex-col"
          style={{
            width: "16rem", flexShrink: 0, borderRight: "1px solid var(--border)",
            backgroundColor: "var(--bg-page)", position: "sticky", top: 0, height: "100vh",
          }}
        >
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
            {aiSidebar.conversations === null ? (
              [...Array(4)].map((_, i) => (
                <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
              ))
            ) : aiSidebar.conversations.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", padding: "0.5rem" }}>Nenhuma conversa ainda.</p>
            ) : (
              aiSidebar.conversations.map(c => {
                const active = c.id === aiSidebar.activeId;
                return (
                  <div
                    key={c.id}
                    onClick={() => aiSidebar.onSelect(c.id)}
                    className="group"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
                      padding: "0.625rem 0.75rem", borderRadius: "0.75rem", cursor: "pointer",
                      backgroundColor: active ? "rgba(37,99,235,0.1)" : "transparent",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--bg-muted)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{
                        color: active ? "#2563eb" : "var(--text-base)", fontSize: "0.8125rem", fontWeight: active ? 600 : 500,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {c.title || "Nova conversa"}
                      </p>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.1rem" }}>
                        {relativeLabel(c.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); aiSidebar.onDelete(c); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ padding: "0.3rem", borderRadius: "0.4rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
                      title="Excluir conversa"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 shrink-0">
            <button onClick={aiSidebar.onNew} className="btn-primary text-sm w-full flex items-center justify-center gap-2">
              <IconPlus className="w-4 h-4" /> Nova conversa
            </button>
          </div>
        </aside>
      )}

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile-only top bar — nav lives in the dropdown panel below it */}
        <header
          style={{ backgroundColor: "var(--bg-header)", borderBottom: "1px solid var(--border)" }}
          className="backdrop-blur-md sticky top-0 z-20 md:hidden"
        >
          <div className="px-3 sm:px-6 flex items-center justify-between h-14 gap-2 sm:gap-4">

            <button
              onClick={() => setMobileOpen(v => !v)}
              className="btn-ghost p-2 rounded-xl"
              title="Menu"
            >
              {mobileOpen ? <IconX className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
            </button>

            <NavLink to="/" className="flex items-center gap-2 shrink-0">
              <IconFortuna className="w-7 h-7 block" />
              <span style={{ color: "var(--text-primary)" }} className="font-bold text-sm tracking-tight">
                Fortuna
              </span>
            </NavLink>

            <div className="flex items-center gap-1 shrink-0 min-w-0">
              <ProfileLink user={user} />

              <button
                onClick={toggle}
                className="btn-ghost p-2 rounded-xl"
                title={dark ? "Modo claro" : "Modo escuro"}
              >
                {dark
                  ? <IconSun className="w-4 h-4 text-amber-400" />
                  : <IconMoon className="w-4 h-4" />
                }
              </button>

              <button
                onClick={handleLogout}
                className="btn-ghost p-2 rounded-xl"
                title="Sair"
                style={{ color: "var(--text-muted)" }}
              >
                <IconLogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile menu panel — icon + label, plan switcher included */}
          {mobileOpen && (
            <div style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg-header)" }}>
              <nav className="px-3 py-2 flex flex-col gap-0.5">
                {navItems.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to} to={to} end={to === "/"} className={navLinkClass}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="px-3 pb-3">
                <PlanSwitcher user={user} />
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
          {children}
        </main>

        <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-3">
          <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center" }} title={`Commit ${__APP_VERSION__}`}>
            v{__APP_VERSION__}
          </p>
        </footer>
      </div>

      <GlobalQuickAdd />
      {!onAssistantPage && <AiChatWidget />}
    </div>
    </AiSidebarContext.Provider>
  );
}
