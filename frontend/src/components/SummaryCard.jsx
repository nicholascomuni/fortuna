import { useTheme } from "../context/ThemeContext";

const iconStyle = {
  blue:   { bg: "#eff6ff", color: "#2563eb",  darkBg: "rgba(30,58,138,0.3)",  darkColor: "#60a5fa" },
  green:  { bg: "#ecfdf5", color: "#059669",  darkBg: "rgba(6,78,59,0.3)",    darkColor: "#34d399" },
  red:    { bg: "#fff1f2", color: "#e11d48",  darkBg: "rgba(136,19,55,0.3)",  darkColor: "#fb7185" },
  yellow: { bg: "#fffbeb", color: "#d97706",  darkBg: "rgba(120,53,15,0.3)",  darkColor: "#fbbf24" },
};

const valueStyle = {
  blue:   { light: "#111827", dark: "#ffffff" },
  green:  { light: "#047857", dark: "#34d399" },
  red:    { light: "#be123c", dark: "#fb7185" },
  yellow: { light: "#b45309", dark: "#fbbf24" },
};

export default function SummaryCard({ title, value, sub, color = "blue", loading, icon: Icon }) {
  const { dark } = useTheme();
  const ic = iconStyle[color];
  const vc = valueStyle[color];

  return (
    <div className="card p-5 flex items-start gap-4">
      {Icon && (
        <div style={{
          backgroundColor: dark ? ic.darkBg : ic.bg,
          color: dark ? ic.darkColor : ic.color,
          borderRadius: "0.75rem",
          padding: "0.625rem",
          flexShrink: 0,
        }}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
          {title}
        </p>
        {loading ? (
          <div style={{ height: "1.75rem", width: "7rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
        ) : (
          <p style={{ color: dark ? vc.dark : vc.light, fontSize: "1.25rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value}
          </p>
        )}
        {sub && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.125rem" }}>{sub}</p>
        )}
      </div>
    </div>
  );
}
