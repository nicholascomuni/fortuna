import { useState } from "react";
import { api } from "../api/client";
import TransactionForm from "./TransactionForm";
import { IconPlus, IconX } from "./Icons";

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 60, padding: "0.75rem 1rem", borderRadius: "0.75rem", boxShadow: "0 10px 15px -3px rgb(0 0 0 / .1)", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {toast.type === "error" ? "✕" : "✓"} {toast.msg}
    </div>
  );
}

// The "Nova movimentação" quick-add is available everywhere (not just the
// Dashboard) — it lazily loads its own form data on open and fires a
// window event on success so any page showing transaction data (currently
// just the Dashboard) can refresh itself without this component needing to
// know about that page's state.
export default function GlobalQuickAdd() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(null); // { cards, accounts, categories }
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleOpen() {
    setOpen(true);
    if (formData) return;
    try {
      const [cards, accounts, categories] = await Promise.all([
        api.getCards(), api.getAccounts(), api.getCategories(),
      ]);
      setFormData({ cards, accounts, categories });
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleSubmit(payload) {
    const isCard = payload.payment_method === "cartao_credito";
    setLoading(true);
    try {
      if (isCard) {
        await api.createCreditPurchase(payload);
        showToast("Compra no cartão adicionada!");
      } else {
        await api.createTransaction(payload);
        showToast("Movimentação adicionada!");
      }
      setOpen(false);
      window.dispatchEvent(new CustomEvent("finance:changed"));
    } catch (err) {
      showToast(err.message, "error");
      if (isCard) throw err; // lets TransactionForm show the inline error too
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Toast toast={toast} />

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card w-full max-w-lg p-6"
            style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>Nova movimentação</h2>
              <button onClick={() => setOpen(false)} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
            </div>
            {formData ? (
              <TransactionForm
                onSubmit={handleSubmit}
                cards={formData.cards}
                accounts={formData.accounts}
                categories={formData.categories}
                onCancel={() => setOpen(false)}
                loading={loading}
              />
            ) : (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ height: "2.5rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleOpen}
        className="btn-primary flex items-center justify-center gap-2"
        style={{
          position: "fixed", right: "5.25rem", bottom: "1.25rem", zIndex: 25,
          borderRadius: "9999px", padding: "0.875rem 1.25rem",
          boxShadow: "0 12px 24px -8px rgba(37,99,235,0.55)",
          fontWeight: 600,
        }}
        title="Nova movimentação"
      >
        <IconPlus className="w-4 h-4" />
        <span className="hidden sm:inline">Nova movimentação</span>
      </button>
    </>
  );
}
