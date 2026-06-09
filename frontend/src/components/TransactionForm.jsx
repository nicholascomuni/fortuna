import { useState, useEffect } from "react";
import { today } from "../utils/format";
import CategoryInput from "./CategoryInput";
import { api } from "../api/client";

// Given a due day (1-31), return the next occurrence as "YYYY-MM-DD".
// If the day hasn't passed yet this month, use this month; otherwise next month.
function nextDueDate(day) {
  const d = parseInt(day);
  if (!d || d < 1 || d > 31) return today();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  // clamp to last valid day of that month
  const clamp = (y, m, dy) => {
    const last = new Date(y, m + 1, 0).getDate();
    return Math.min(dy, last);
  };
  const thisMonthDay = clamp(year, month, d);
  const candidate = new Date(year, month, thisMonthDay);
  if (candidate >= now) {
    return candidate.toISOString().split("T")[0];
  }
  // next month
  const nm = month + 1 > 11 ? 0 : month + 1;
  const ny = month + 1 > 11 ? year + 1 : year;
  const nextMonthDay = clamp(ny, nm, d);
  return new Date(ny, nm, nextMonthDay).toISOString().split("T")[0];
}

const empty = {
  description: "", amount: "", kind: "despesa", type: "pontual",
  date: today(), category: "", frequency: "mensal",
  recurrence_end_type: "por_ocorrencias", recurrence_end_date: "", recurrence_count: "12",
  payment_method: "a_vista", installments: "1",
};

// ── Segmented toggle button ───────────────────────────────────────────────────
// Each option: { v, label, icon }
// active variants: "red" | "green" | "blue" | "indigo"
const ACTIVE_COLORS = {
  red:    { bg: "rgba(225,29,72,0.12)",   border: "rgba(225,29,72,0.4)",   color: "#e11d48" },
  green:  { bg: "rgba(5,150,105,0.12)",   border: "rgba(5,150,105,0.4)",   color: "#059669" },
  blue:   { bg: "rgba(37,99,235,0.10)",   border: "rgba(37,99,235,0.35)",  color: "#2563eb" },
  indigo: { bg: "rgba(99,102,241,0.10)",  border: "rgba(99,102,241,0.35)", color: "#6366f1" },
};

function SegmentedGroup({ options, value, onChange, activeColor = "blue" }) {
  const ac = ACTIVE_COLORS[activeColor];
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
      {options.map(({ v, label, icon }) => {
        const isActive = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
              fontWeight: isActive ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
              backgroundColor: isActive ? ac.bg : "transparent",
              border: `1px solid ${isActive ? ac.border : "var(--border-input)"}`,
              color: isActive ? ac.color : "var(--text-secondary)",
            }}
          >
            {icon && <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>{icon}</span>}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// SVG icons inline — same stroke style as Icons.jsx
const s = "stroke-current fill-none";
const IcoArrowDown  = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
const IcoArrowUp    = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const IcoBanknote   = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>;
const IcoCard       = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
const IcoSplit      = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M21 3l-7 7-4-4-7 7"/></svg>;
const IcoPin        = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 4-7 13-7 13S5 13 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
const IcoRepeat     = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;

const KIND_OPTIONS = [
  { v: "despesa", label: "Despesa", icon: IcoArrowDown },
  { v: "receita", label: "Receita", icon: IcoArrowUp   },
];

const PAYMENT_OPTIONS = [
  { v: "a_vista", label: "À vista",  icon: IcoBanknote },
  { v: "debito",  label: "Débito",   icon: IcoCard     },
  { v: "credito", label: "Crédito",  icon: IcoSplit    },
];

const MODALITY_OPTIONS = [
  { v: "pontual",    label: "Pontual",    icon: IcoPin    },
  { v: "recorrente", label: "Recorrente", icon: IcoRepeat },
];

const END_TYPE_OPTIONS = [
  { v: "por_ocorrencias", label: "Nº de vezes" },
  { v: "por_data",        label: "Data final"  },
];

// When editing a credit+installments transaction the DB stores the per-installment
// amount, so we reconstruct the total so the form shows the full value.
function _initialAmount(initial) {
  if (
    initial?.payment_method === "credito" &&
    initial?.installments > 1 &&
    initial?.amount
  ) {
    return String((parseFloat(initial.amount) * initial.installments).toFixed(2));
  }
  return String(initial?.amount ?? "");
}

// ── Main form ─────────────────────────────────────────────────────────────────

export default function TransactionForm({ initial, onSubmit, onCancel, loading, categories = [] }) {
  const [form, setForm] = useState(
    initial ? { ...empty, ...initial, installments: String(initial.installments ?? 1), amount: _initialAmount(initial) } : empty
  );
  const [errors, setErrors] = useState([]);
  // credit due-day flow
  const [dueDay, setDueDay]         = useState("");
  const [knownDays, setKnownDays]   = useState([]); // unique due days from existing credit txs

  // Load previously used due days once (for the suggestion chips)
  useEffect(() => {
    api.getTransactions({ kind: "despesa" })
      .then(txs => {
        const days = [...new Set(
          txs
            .filter(t => t.payment_method === "credito")
            .map(t => String(new Date(t.date + "T12:00:00").getDate()))
        )].sort((a, b) => parseInt(a) - parseInt(b));
        setKnownDays(days);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({ ...empty, ...initial, installments: String(initial.installments ?? 1), amount: _initialAmount(initial) });
      // If editing a credit tx, derive the due day from the stored date
      if (initial.payment_method === "credito" && initial.date) {
        setDueDay(String(new Date(initial.date + "T12:00:00").getDate()));
      }
    }
  }, [initial]);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function setKind(v) {
    setForm(f => ({ ...f, kind: v, payment_method: "a_vista", installments: "1" }));
    setDueDay("");
  }

  function setDueDayAndDate(day) {
    setDueDay(day);
    if (day) set("date", nextDueDate(day));
  }

  const isCredit       = form.payment_method === "credito" && form.kind === "despesa";
  const installmentsNum = parseInt(form.installments) || 1;
  const forcedRecorrente = isCredit && installmentsNum > 1;
  const totalAmount    = parseFloat(form.amount) || 0;
  const installmentAmount = isCredit && installmentsNum > 1
    ? (totalAmount / installmentsNum).toFixed(2)
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    const payload = {
      description: form.description,
      amount: installmentAmount ?? form.amount,
      kind: form.kind,
      type: forcedRecorrente ? "recorrente" : form.type,
      date: form.date,
      category: form.category || null,
      payment_method: form.kind === "despesa" ? form.payment_method : "a_vista",
      installments: isCredit ? installmentsNum : null,
    };
    if (!forcedRecorrente && payload.type === "recorrente") {
      payload.frequency = form.frequency;
      payload.recurrence_end_type = form.recurrence_end_type;
      if (form.recurrence_end_type === "por_data") payload.recurrence_end_date = form.recurrence_end_date;
      else payload.recurrence_count = form.recurrence_count;
    }
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

      {/* Description */}
      <div>
        <label className="label">Descrição *</label>
        <input type="text" value={form.description}
          onChange={e => set("description", e.target.value)}
          placeholder="Ex.: Aluguel, Salário, Netflix…" required className="input" />
      </div>

      {/* Amount + Kind */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Valor (R$) *</label>
          <input type="number" min="0.01" step="0.01" value={form.amount}
            onChange={e => set("amount", e.target.value)}
            placeholder="0,00" required className="input" />
        </div>
        <div>
          <label className="label">Tipo *</label>
          <SegmentedGroup
            options={KIND_OPTIONS}
            value={form.kind}
            onChange={setKind}
            activeColor={form.kind === "receita" ? "green" : "red"}
          />
        </div>
      </div>

      {/* Date + Category */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          {!isCredit ? (
            <>
              <label className="label">Data *</label>
              <input type="date" value={form.date}
                onChange={e => set("date", e.target.value)} required className="input" />
            </>
          ) : (
            <>
              <label className="label">Dia de vencimento *</label>
              {/* Suggestion chips from prior credit transactions */}
              {knownDays.length > 0 && (
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.375rem", marginTop: "0.25rem" }}>
                  {knownDays.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDueDayAndDate(d)}
                      style={{
                        padding: "0.2rem 0.6rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: dueDay === d ? 600 : 400,
                        cursor: "pointer",
                        transition: "all 0.12s",
                        border: `1px solid ${dueDay === d ? "rgba(99,102,241,0.5)" : "var(--border-input)"}`,
                        backgroundColor: dueDay === d ? "rgba(99,102,241,0.12)" : "transparent",
                        color: dueDay === d ? "#6366f1" : "var(--text-secondary)",
                      }}
                    >
                      dia {d}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="number" min="1" max="31" step="1"
                  value={dueDay}
                  onChange={e => setDueDayAndDate(e.target.value)}
                  placeholder="Ex.: 10"
                  required
                  className="input w-24"
                />
                {dueDay && parseInt(dueDay) >= 1 && parseInt(dueDay) <= 31 && (
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    → <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{form.date}</span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <label className="label">Categoria</label>
          <CategoryInput value={form.category} onChange={v => set("category", v)} extraCategories={categories} />
        </div>
      </div>

      {/* Payment method — apenas para despesas */}
      {form.kind === "despesa" && (
        <div>
          <label className="label">Forma de pagamento</label>
          <SegmentedGroup
            options={PAYMENT_OPTIONS}
            value={form.payment_method}
            onChange={v => {
              set("payment_method", v);
              if (v !== "credito") { setDueDay(""); set("date", today()); }
            }}
            activeColor="indigo"
          />
        </div>
      )}

      {/* Credit installments */}
      {isCredit && (
        <div style={{ border: "1px solid rgba(99,102,241,0.25)", backgroundColor: "rgba(99,102,241,0.05)", borderRadius: "0.75rem", padding: "1rem" }}>
          <label className="label">Parcelas *</label>
          <div className="flex items-center gap-3">
            <input
              type="number" min="1" max="72" step="1"
              value={form.installments}
              onChange={e => set("installments", e.target.value)}
              className="input w-28"
            />
            {installmentsNum > 1 && totalAmount > 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {installmentsNum}× de <strong>R$ {installmentAmount}</strong> — recorrente mensal
              </p>
            ) : (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                Pagamento único no crédito
              </p>
            )}
          </div>
        </div>
      )}

      {/* Pontual / Recorrente */}
      {!forcedRecorrente && (
        <div>
          <label className="label">Modalidade *</label>
          <SegmentedGroup
            options={MODALITY_OPTIONS}
            value={form.type}
            onChange={v => set("type", v)}
            activeColor="blue"
          />
        </div>
      )}

      {/* Recurrence options */}
      {!forcedRecorrente && form.type === "recorrente" && (
        <div style={{ border: "1px solid rgba(37,99,235,0.2)", backgroundColor: "rgba(37,99,235,0.04)", borderRadius: "0.75rem", padding: "1rem" }} className="space-y-4">
          <div>
            <label className="label">Frequência *</label>
            <select value={form.frequency} onChange={e => set("frequency", e.target.value)} className="input">
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <div>
            <label className="label">Fim da recorrência *</label>
            <SegmentedGroup
              options={END_TYPE_OPTIONS}
              value={form.recurrence_end_type}
              onChange={v => set("recurrence_end_type", v)}
              activeColor="blue"
            />
            <div style={{ marginTop: "0.75rem" }}>
              {form.recurrence_end_type === "por_ocorrencias" ? (
                <div>
                  <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Número de vezes</label>
                  <input type="number" min="1" step="1" value={form.recurrence_count}
                    onChange={e => set("recurrence_count", e.target.value)} className="input w-32" />
                </div>
              ) : (
                <div>
                  <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Data de término</label>
                  <input type="date" value={form.recurrence_end_date}
                    onChange={e => set("recurrence_end_date", e.target.value)} className="input w-48" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", marginTop: "0.25rem" }}>
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.5rem",
            borderRadius: "0.75rem",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "all 0.15s",
            border: "none",
            backgroundColor: form.kind === "receita" ? "#059669" : "#2563eb",
            color: "#fff",
            boxShadow: form.kind === "receita"
              ? "0 2px 8px rgba(5,150,105,0.35)"
              : "0 2px 8px rgba(37,99,235,0.35)",
          }}
        >
          {loading ? "Salvando…" : isEdit ? "✓  Salvar alterações" : `${form.kind === "receita" ? "↑" : "↓"}  ${isEdit ? "Salvar" : "Adicionar"}`}
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
