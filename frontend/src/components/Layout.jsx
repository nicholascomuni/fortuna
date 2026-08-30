import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  IconChart, IconRepeat, IconFlask, IconSettings,
  IconSun, IconMoon, IconLogOut, IconDollarSign, IconBarChart,
} from "./Icons";

const navItems = [
  { to: "/",              label: "Dashboard",    Icon: IconChart    },
  { to: "/relatorios",    label: "Relatórios",   Icon: IconBarChart },
  { to: "/recorrentes",   label: "Recorrentes",  Icon: IconRepeat   },
  { to: "/simulador",     label: "Simulador",    Icon: IconFlask    },
  { to: "/configuracoes", label: "Configurações", Icon: IconSettings },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-primary)" }} className="flex flex-col">
      <header
        style={{ backgroundColor: "var(--bg-header)", borderBottom: "1px solid var(--border)" }}
        className="backdrop-blur-md sticky top-0 z-10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
              <IconDollarSign className="w-4 h-4 text-white stroke-white" />
            </div>
            <span style={{ color: "var(--text-primary)" }} className="font-bold text-sm tracking-tight hidden sm:inline">
              Minhas Finanças
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1 shrink-0">
            {user && (
              <span style={{ color: "var(--text-secondary)" }} className="text-xs mr-2 hidden md:inline">
                {user.name.split(" ")[0]}
              </span>
            )}

            {/* Theme toggle */}
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

            {/* Logout */}
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
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
