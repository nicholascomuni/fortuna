import { useState, useEffect } from "react";
import { today } from "../utils/format";
import CategoryInput from "./CategoryInput";

const empty = {
  description: "", total_amount: "", category: "",
  purchase_date: today(), installments: "1", card_id: "",
};

function _fromInitial(initial) {
  return {
    ...empty,
    ...initial,
    total_amount: String(initial.total_amount ?? ""),
    installments: String(initial.installments ?? 1),
    card_id: String(initial.card_id ?? ""),
  };
}

export default function CreditPurchaseForm({ initial, cards, onSubmit, onCancel, loading, categories = [] }) {
  const [form, setForm] = useState(
    initial
      ? _fromInitial(initial)
      : { ...empty, card_id: cards[0] ? String(cards[0].id) : "" }
  );
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (initial) setForm(_fromInitial(initial));
  }, [initial]);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  const installmentsNum = parseInt(form.installments) || 1;
  const totalAmount = parseFloat(form.total_amount) || 0;
  const installmentAmount = installmentsNum > 1 ? (totalAmount / installmentsNum).toFixed(2) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    const payload = {
      description: form.description,
      total_amount: form.total_amount,
      category: form.category || null,
      purchase_date: form.purchase_date,
      installments: installmentsNum,
      card_id: parseInt(form.card_id),
    };
    try { await onSubmit(payload); }
    catch (err) { setErrors([err.message]); }
  }

  const isEdit = !!initial?.id;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errors.length > 0 && (
        <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem" }}>
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <div>
        <label className="label">Descrição *</label>
        <input type="text" value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="Ex.: Notebook, Supermercado…" required className="input" />
      </div>

      <div>
        <label className="label">Cartão *</label>
        <select value={form.card_id} onChange={e => set("card_id", e.target.value)} required className="input">
          {cards.length === 0 && <option value="">Nenhum cartão cadastrado</option>}
          {cards.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.bank ? ` — ${c.bank}` : ""}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Valor total (R$) *</label>
          <input type="number" min="0.01" step="0.01" value={form.total_amount}
            onChange={e => set("total_amount", e.target.value)}
            placeholder="0,00" required className="input" />
        </div>
        <div>
          <label className="label">Data da compra *</label>
          <input type="date" value={form.purchase_date}
            onChange={e => set("purchase_date", e.target.value)} required className="input" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Categoria</label>
          <CategoryInput value={form.category} onChange={v => set("category", v)} extraCategories={categories} />
        </div>
        <div>
          <label className="label">Parcelas *</label>
          <input type="number" min="1" max="72" step="1" value={form.installments}
            onChange={e => set("installments", e.target.value)} className="input" />
        </div>
      </div>

      {installmentsNum > 1 && totalAmount > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          {installmentsNum}× de <strong>R$ {installmentAmount}</strong> — uma cobrança em cada fatura mensal
        </p>
      )}

      <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", marginTop: "0.25rem" }}>
        <button
          type="submit"
          disabled={loading || cards.length === 0}
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            padding: "0.625rem 1.5rem", borderRadius: "0.75rem",
            fontSize: "0.9375rem", fontWeight: 600,
            cursor: (loading || cards.length === 0) ? "not-allowed" : "pointer",
            opacity: (loading || cards.length === 0) ? 0.6 : 1,
            transition: "all 0.15s", border: "none",
            backgroundColor: "#2563eb", color: "#fff",
            boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
          }}
        >
          {loading ? "Salvando…" : isEdit ? "✓  Salvar alterações" : "↓  Adicionar compra"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost px-5" style={{ border: "1px solid var(--border)" }}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
