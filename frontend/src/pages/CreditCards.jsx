import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import CreditCardVisual from "../components/CreditCardVisual";
import CreditPurchaseForm from "../components/CreditPurchaseForm";
import { IconPlus, IconEdit, IconTrash, IconX, IconCreditCard } from "../components/Icons";

const COLOR_PRESETS = ["#4f46e5", "#059669", "#e11d48", "#ea580c", "#0891b2", "#7c3aed"];

const emptyCard = { name: "", bank: "", due_day: "10", credit_limit: "", color: COLOR_PRESETS[0] };

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}>
      <div className="card w-full max-w-lg p-6" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, padding: "0.75rem 1rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669" }}>
      {toast.msg}
    </div>
  );
}

function CardForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial ? {
    ...emptyCard, ...initial,
    due_day: String(initial.due_day ?? "10"),
    credit_limit: initial.credit_limit != null ? String(initial.credit_limit) : "",
    color: initial.color || COLOR_PRESETS[0],
  } : emptyCard);
  const [errors, setErrors] = useState([]);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    try {
      await onSubmit({
        name: form.name,
        bank: form.bank || null,
        due_day: parseInt(form.due_day),
        credit_limit: form.credit_limit || null,
        color: form.color,
      });
    } catch (err) { setErrors([err.message]); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.length > 0 && (
        <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem" }}>
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div>
        <label className="label">Nome ou apelido *</label>
        <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
          placeholder="Ex.: Nubank Roxinho" required className="input" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Banco (opcional)</label>
          <input type="text" value={form.bank} onChange={e => set("bank", e.target.value)}
            placeholder="Ex.: Nubank" className="input" />
        </div>
        <div>
          <label className="label">Dia de vencimento *</label>
          <input type="number" min="1" max="31" step="1" value={form.due_day}
            onChange={e => set("due_day", e.target.value)} required className="input" />
        </div>
      </div>
      <div>
        <label className="label">Limite do cartão (opcional)</label>
        <input type="number" min="0.01" step="0.01" value={form.credit_limit}
          onChange={e => set("credit_limit", e.target.value)} placeholder="0,00" className="input" />
      </div>
      <div>
        <label className="label">Cor</label>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
          {COLOR_PRESETS.map(c => (
            <button key={c} type="button" onClick={() => set("color", c)}
              style={{
                width: "1.75rem", height: "1.75rem", borderRadius: "9999px", backgroundColor: c,
                cursor: "pointer", border: form.color === c ? "2px solid var(--text-base)" : "2px solid transparent",
                outline: form.color === c ? "2px solid " + c : "none", outlineOffset: "2px",
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", marginTop: "0.25rem" }}>
        <button type="submit" disabled={loading} className="btn-primary flex-1" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? "Salvando…" : "Salvar cartão"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-5" style={{ border: "1px solid var(--border)" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function CreditCards() {
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [cardModal, setCardModal] = useState(null); // null | {} (new) | card (edit)
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const { confirm, confirmEl } = useConfirm();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsData, cats] = await Promise.all([api.getCards(), api.getCategories()]);
      setCards(cardsData); setCategories(cats);
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCardSave(payload) {
    setSaveLoading(true);
    try {
      if (cardModal?.id) await api.updateCard(cardModal.id, payload);
      else await api.createCard(payload);
      showToast(cardModal?.id ? "Cartão atualizado!" : "Cartão adicionado!");
      setCardModal(null); load();
    } catch (err) { showToast(err.message, "error"); throw err; }
    finally { setSaveLoading(false); }
  }

  async function handleCardDelete(card) {
    const ok = await confirm({
      title: "Excluir cartão",
      message: `Tem certeza que deseja excluir "${card.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try { await api.deleteCard(card.id); showToast("Cartão excluído."); load(); }
    catch (err) { showToast(err.message, "error"); }
  }

  async function handlePurchaseSave(payload) {
    setSaveLoading(true);
    try {
      await api.createCreditPurchase(payload);
      showToast("Compra adicionada!");
      setPurchaseModal(false); load();
    } catch (err) { showToast(err.message, "error"); throw err; }
    finally { setSaveLoading(false); }
  }

  return (
    <div className="space-y-5">
      {confirmEl}
      <Toast toast={toast} />

      {cardModal && (
        <Modal title={cardModal.id ? "Editar cartão" : "Adicionar cartão"} onClose={() => setCardModal(null)}>
          <CardForm initial={cardModal.id ? cardModal : null} onSubmit={handleCardSave}
            onCancel={() => setCardModal(null)} loading={saveLoading} />
        </Modal>
      )}

      {purchaseModal && (
        <Modal title="Nova compra no cartão" onClose={() => setPurchaseModal(false)}>
          <CreditPurchaseForm cards={cards} onSubmit={handlePurchaseSave}
            onCancel={() => setPurchaseModal(false)} loading={saveLoading} categories={categories} />
        </Modal>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Cartões</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
            Controle de fatura por cartão de crédito
          </p>
        </div>
        <div className="flex gap-2">
          {cards.length > 0 && (
            <button onClick={() => setPurchaseModal(true)} className="btn-ghost text-sm flex items-center gap-2" style={{ border: "1px solid var(--border)" }}>
              <IconCreditCard className="w-4 h-4" /> Nova compra
            </button>
          )}
          <button onClick={() => setCardModal({})} className="btn-primary text-sm flex items-center gap-2">
            <IconPlus className="w-4 h-4" /> Adicionar cartão
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: "9.5rem", borderRadius: "1.1rem", backgroundColor: "var(--bg-muted)" }} className="animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="card py-16 text-center">
          <div style={{ width: "3rem", height: "3rem", borderRadius: "1rem", backgroundColor: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
            <IconCreditCard className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhum cartão cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(card => (
            <div key={card.id} className="space-y-2">
              <CreditCardVisual card={card} invoice={card.current_month_invoice} limitUsedPct={card.limit_used_pct} />
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => setCardModal(card)} title="Editar"
                  style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <IconEdit className="w-4 h-4" />
                </button>
                <button onClick={() => handleCardDelete(card)} title="Excluir"
                  style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <IconTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
