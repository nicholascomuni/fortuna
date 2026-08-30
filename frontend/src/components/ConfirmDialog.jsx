import { useEffect, useRef } from "react";
import { IconAlertTriangle } from "./Icons";

export function ConfirmDialog({ open, title, message, confirmLabel = "Excluir", danger = true, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  // Focus cancel button on open (safer default)
  useEffect(() => {
    if (open) setTimeout(() => cancelRef.current?.focus(), 30);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg    = danger ? "#e11d48" : "#2563eb";
  const confirmShadow = danger ? "0 2px 8px rgba(225,29,72,0.35)" : "0 2px 8px rgba(37,99,235,0.35)";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        backgroundColor: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{
          width: "100%", maxWidth: "22rem",
          padding: "1.5rem",
          boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)",
          display: "flex", flexDirection: "column", gap: "1rem",
        }}
      >
        {/* Icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          {danger && (
            <div style={{
              width: "2rem", height: "2rem", borderRadius: "0.625rem", flexShrink: 0,
              backgroundColor: "rgba(225,29,72,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <IconAlertTriangle className="w-4 h-4" style={{ color: "#e11d48" }} />
            </div>
          )}
          <p style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>
            {title}
          </p>
        </div>

        {/* Message */}
        {message && (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
            {message}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-ghost px-4 py-2 text-sm"
            style={{ border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1.125rem", borderRadius: "0.75rem",
              fontSize: "0.875rem", fontWeight: 600, cursor: "pointer",
              border: "none", color: "#fff",
              backgroundColor: confirmBg,
              boxShadow: confirmShadow,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
// Usage:
//   const { confirmEl, confirm } = useConfirm();
//   await confirm({ title: "...", message: "..." });  // resolves true/false
//   return <>{confirmEl}</>;

import { useState, useCallback } from "react";

export function useConfirm() {
  const [state, setState] = useState(null); // null | { title, message, confirmLabel, danger, resolve }

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  function handleConfirm() { state?.resolve(true);  setState(null); }
  function handleCancel()  { state?.resolve(false); setState(null); }

  const confirmEl = (
    <ConfirmDialog
      open={!!state}
      title={state?.title ?? "Confirmar"}
      message={state?.message}
      confirmLabel={state?.confirmLabel ?? "Confirmar"}
      danger={state?.danger ?? true}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, confirmEl };
}
