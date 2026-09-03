import { IconBank } from "./Icons";

const DEFAULT_GRADIENT = "linear-gradient(135deg, #4f46e5 0%, #2563eb 55%, #0ea5e9 100%)";

function formatBRL(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

export default function CreditCardVisual({ card, invoice, openBalance, limitUsedPct, onClick }) {
  const background = card.color
    ? `linear-gradient(135deg, ${card.color} 0%, ${card.color}cc 100%)`
    : DEFAULT_GRADIENT;

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        borderRadius: "1.1rem",
        padding: "1.25rem",
        minHeight: "9.5rem",
        background,
        color: "#fff",
        boxShadow: "0 12px 24px -8px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.15s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Decorative chip */}
      <div
        style={{
          position: "absolute", top: "1.1rem", right: "1.25rem",
          width: "2.1rem", height: "1.5rem", borderRadius: "0.3rem",
          background: "rgba(255,255,255,0.35)",
          border: "1px solid rgba(255,255,255,0.5)",
        }}
      />

      <div>
        <p style={{ fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.01em", marginBottom: "0.3rem" }}>
          {card.name}
        </p>
        {card.bank && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", opacity: 0.85, fontSize: "0.8rem" }}>
            <IconBank className="w-3.5 h-3.5" />
            {card.bank}
          </div>
        )}
      </div>

      <div>
        <p style={{ fontSize: "0.7rem", opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Vence dia {card.due_day}
        </p>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.15rem" }}>
          {formatBRL(invoice)}
          <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.8 }}> / mês atual</span>
        </p>

        {card.credit_limit != null && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{
              width: "100%", height: "0.35rem", borderRadius: "999px",
              background: "rgba(255,255,255,0.25)", overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.min(limitUsedPct ?? 0, 100)}%`, height: "100%",
                background: (limitUsedPct ?? 0) >= 90 ? "#fda4af" : "#fff",
                borderRadius: "999px", transition: "width 0.3s",
              }} />
            </div>
            <p style={{ fontSize: "0.68rem", opacity: 0.85, marginTop: "0.25rem" }}>
              {formatBRL(openBalance)} usado{limitUsedPct != null ? ` (${limitUsedPct}%)` : ""} · limite {formatBRL(card.credit_limit)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
