import { useState } from "react";
import CategoryInput from "./CategoryInput";

// Deliberately narrow: editing an existing lançamento only exposes the
// three fields worth correcting after the fact (valor, categoria, taxa de
// juros) — not the full creation form (description/date/account/etc. stay
// as they were). update_transaction replaces the whole row server-side, so
// every other field is carried over unchanged from `initial` on submit.
export default function EditTransactionForm({ initial, onSubmit, onCancel, loading, categories = [] }) {
  const [amount, setAmount] = useState(String(initial.amount ?? ""));
  const [category, setCategory] = useState(initial.category ?? "");
  const [interestRate, setInterestRate] = useState(initial.interest_rate != null ? String(initial.interest_rate) : "");
  const [errors, setErrors] = useState([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    const rate = interestRate ? parseFloat(interestRate) : null;
    const payload = {
      description: initial.description,
      amount,
      kind: initial.kind,
      type: initial.type,
      date: initial.date,
      category: category || null,
      payment_method: initial.payment_method,
      account_id: initial.account_id ?? null,
      interest_rate: rate,
      interest_period: rate ? (initial.interest_period || "mensal") : null,
      interest_count: rate ? (initial.interest_count || 12) : null,
    };
    if (initial.type === "recorrente") {
      payload.frequency = initial.frequency;
      payload.recurrence_end_type = initial.recurrence_end_type;
      if (initial.recurrence_end_type === "por_data") payload.recurrence_end_date = initial.recurrence_end_date;
      else payload.recurrence_count = initial.recurrence_count;
    }
    try { await onSubmit(payload); }
    catch (err) { setErrors([err.message]); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {errors.length > 0 && (
        <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem" }}>
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <div>
        <label className="label">Descrição</label>
        <p style={{ color: "var(--text-base)", fontSize: "0.875rem", fontWeight: 500 }}>{initial.description}</p>
      </div>

      <div>
        <label className="label">Valor (R$) *</label>
        <input type="number" step="0.01" min="0.01" value={amount}
          onChange={e => setAmount(e.target.value)} required className="input" />
      </div>

      <div>
        <label className="label">Categoria</label>
        <CategoryInput value={category} onChange={setCategory} extraCategories={categories} />
      </div>

      <div>
        <label className="label">Taxa de juros (% opcional)</label>
        <input type="number" step="0.01" min="0" value={interestRate}
          onChange={e => setInterestRate(e.target.value)} className="input" placeholder="Ex.: 1,5" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">{loading ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}
