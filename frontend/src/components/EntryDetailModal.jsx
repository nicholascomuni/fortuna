import { IconX, IconEdit, IconTrash } from "./Icons";

// Generic read-only detail popup for a table row (transaction, invoice,
// card purchase…) — same glass-blur "liquid glass" look as the other
// modals in the app. The caller builds the field list; this component just
// renders it consistently.
export default function EntryDetailModal({ title, badge, fields = [], note, onClose, onEdit, onDelete }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClose(); }}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card w-full max-w-md p-6"
        style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div className="flex items-start justify-between mb-5 gap-3">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ color: "var(--text-base)", fontSize: "1rem", fontWeight: 600, wordBreak: "break-word" }}>{title}</h2>
            {badge && (
              <span style={{
                display: "inline-block", marginTop: "0.375rem", fontSize: "0.68rem", fontWeight: 600,
                padding: "0.15rem 0.5rem", borderRadius: "9999px",
                backgroundColor: badge.bg, color: badge.color,
              }}>
                {badge.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" style={{ flexShrink: 0 }}><IconX className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {fields.filter(f => f.value != null && f.value !== "").map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-4" style={{ fontSize: "0.875rem" }}>
              <span style={{ color: "var(--text-muted)" }}>{f.label}</span>
              <span style={{ color: "var(--text-base)", fontWeight: f.strong ? 700 : 500, textAlign: "right" }}>{f.value}</span>
            </div>
          ))}
        </div>

        {note && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1rem", paddingTop: "0.875rem", borderTop: "1px solid var(--border)" }}>
            {note}
          </p>
        )}

        {(onEdit || onDelete) && (
          <div style={{ display: "flex", gap: "0.75rem", paddingTop: "1rem", marginTop: "1rem", borderTop: note ? "none" : "1px solid var(--border)" }}>
            {onEdit && (
              <button onClick={onEdit} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                <IconEdit className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex-1 flex items-center justify-center gap-2 text-sm"
                style={{ padding: "0.625rem 1rem", borderRadius: "0.75rem", fontWeight: 600, cursor: "pointer", border: "1px solid rgba(225,29,72,0.35)", backgroundColor: "rgba(225,29,72,0.1)", color: "#e11d48" }}
              >
                <IconTrash className="w-3.5 h-3.5" /> Excluir
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
