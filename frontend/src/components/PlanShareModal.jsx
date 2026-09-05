import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "../api/client";
import { IconX, IconTrash } from "./Icons";

export default function PlanShareModal({ plan, onClose }) {
  const [shares, setShares] = useState(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPlanShares(plan.id).then(setShares).catch(() => setShares([]));
  }, [plan.id]);

  async function handleShare(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const share = await api.sharePlan(plan.id, { email: email.trim(), permission });
      setShares(prev => [...(prev ?? []).filter(s => s.email !== share.email), share]);
      setEmail("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(shareId) {
    setBusy(true);
    try {
      await api.deletePlanShare(plan.id, shareId);
      setShares(prev => prev.filter(s => s.id !== shareId));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
    >
      <div onClick={e => e.stopPropagation()} className="card w-full max-w-sm p-6" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)" }}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600, wordBreak: "break-word" }}>
            Compartilhar "{plan.name}"
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" style={{ flexShrink: 0 }}><IconX className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleShare} className="space-y-3">
          {error && (
            <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.625rem 0.75rem", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@exemplo.com" className="input text-sm" style={{ flex: 1, minWidth: 0 }} required
            />
            <select value={permission} onChange={e => setPermission(e.target.value)} className="input text-sm" style={{ width: "8rem", flexShrink: 0 }}>
              <option value="read">Leitura</option>
              <option value="edit">Edição</option>
            </select>
          </div>
          <button type="submit" disabled={busy || !email.trim()} className="btn-primary text-sm w-full">
            {busy ? "Compartilhando…" : "Compartilhar"}
          </button>
        </form>

        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.625rem" }}>
            Compartilhado com
          </p>
          {shares === null ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Carregando…</p>
          ) : shares.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Ninguém ainda.</p>
          ) : (
            <div className="space-y-2">
              {shares.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: "var(--text-base)", fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.email}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
                      {s.permission === "edit" ? "Pode editar" : "Somente leitura"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRevoke(s.id)}
                    disabled={busy}
                    title="Remover acesso"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: busy ? "default" : "pointer", flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
