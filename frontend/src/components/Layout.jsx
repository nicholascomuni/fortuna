import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { api } from "../api/client";
import GlobalQuickAdd from "./GlobalQuickAdd";
import AiChatWidget from "./AiChatWidget";
import {
  IconChart, IconRepeat, IconFlask,
  IconSun, IconMoon, IconLogOut, IconFortuna, IconBarChart, IconCreditCard,
  IconWallet, IconChevronDown, IconPlus, IconCheck, IconMenu, IconX, IconUserCircle,
  IconSparkles,
} from "./Icons";

// "Configurações" isn't listed here anymore — the profile icon in the header
// is the entry point for it now (see ProfileLink below).
const navItems = [
  { to: "/",             label: "Dashboard",   Icon: IconChart      },
  { to: "/cartoes",      label: "Cartões",     Icon: IconCreditCard },
  { to: "/contas",       label: "Contas",      Icon: IconWallet     },
  { to: "/relatorios",   label: "Relatórios",  Icon: IconBarChart   },
  { to: "/recorrentes",  label: "Recorrentes", Icon: IconRepeat     },
  { to: "/simulador",    label: "Simulador",   Icon: IconFlask      },
  { to: "/assistente",   label: "Assistente",  Icon: IconSparkles   },
];

// ── Plan switcher — discreet dropdown, current plan name + chevron ──────────

function PlanSwitcher({ user }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function openMenu() {
    setOpen(true);
    api.getPlans().then(setPlans).catch(() => setPlans([]));
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

  if (!user?.active_plan) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="btn-ghost text-xs flex items-center gap-1"
        style={{ padding: "0.375rem 0.625rem", color: "var(--text-secondary)" }}
        title="Trocar plano de contas"
      >
        {user.active_plan.name}
        <IconChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div style={{
          position: "absolute", left: 0, top: "calc(100% + 0.375rem)", zIndex: 30,
          width: "16rem", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "0.75rem", boxShadow: "0 10px 25px -5px rgb(0 0 0/.15)", overflow: "hidden",
        }}>
          <div style={{ padding: "0.5rem" }}>
            <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.25rem 0.5rem" }}>
              Planos de contas
            </p>
            {plans === null ? (
              <p style={{ padding: "0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>Carregando…</p>
            ) : (
              plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => activate(plan)}
                  disabled={busy}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.5rem 0.625rem", borderRadius: "0.5rem", fontSize: "0.8125rem",
                    fontWeight: plan.is_active ? 600 : 400,
                    color: plan.is_active ? "#2563eb" : "var(--text-base)",
                    background: plan.is_active ? "rgba(37,99,235,0.08)" : "transparent",
                    border: "none", cursor: busy ? "default" : "pointer", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "var(--bg-muted)"; }}
                  onMouseLeave={e => { if (!plan.is_active) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {plan.name}
                  {plan.is_active && <IconCheck className="w-3.5 h-3.5" />}
                </button>
              ))
            )}
          </div>
          <form onSubmit={createPlan} style={{ borderTop: "1px solid var(--border)", padding: "0.5rem", display: "flex", gap: "0.375rem" }}>
            <input
              type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Novo plano de contas…" className="input" style={{ fontSize: "0.8125rem", padding: "0.375rem 0.625rem" }}
            />
            <button type="submit" disabled={busy || !newName.trim()} className="btn-ghost p-1.5 rounded-lg" style={{ border: "1px solid var(--border)", flexShrink: 0 }} title="Criar">
              <IconPlus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
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
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }} className="flex">

      {/* ── Sidebar — desktop/tablet only (EXPERIMENTAL: left-side nav test) ── */}
      <aside
        className="hidden md:flex md:flex-col"
        style={{
          width: "15rem", flexShrink: 0, borderRight: "1px solid var(--border)",
          backgroundColor: "var(--bg-header)", position: "sticky", top: 0, height: "100vh",
        }}
      >
        <div className="flex items-center gap-2 px-4 shrink-0" style={{ height: "3.5rem", borderBottom: "1px solid var(--border)" }}>
          <IconFortuna className="w-7 h-7 block" />
          <span style={{ color: "var(--text-primary)" }} className="font-bold text-sm tracking-tight">
            Fortuna
          </span>
        </div>

        <div className="px-3 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
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

            <div className="flex items-center gap-2 shrink-0">
              <IconFortuna className="w-7 h-7 block" />
              <span style={{ color: "var(--text-primary)" }} className="font-bold text-sm tracking-tight hidden sm:inline">
                Fortuna
              </span>
            </div>

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
  );
}
