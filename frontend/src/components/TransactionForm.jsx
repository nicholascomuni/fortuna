import { useState, useEffect } from "react";
import { today } from "../utils/format";
import CategoryInput from "./CategoryInput";

const empty = {
  description: "", amount: "", kind: "despesa", type: "pontual",
  date: today(), category: "", frequency: "mensal",
  recurrence_end_type: "por_ocorrencias", recurrence_end_date: "", recurrence_count: "12",
  payment_method: "a_vista",
  interest_rate: "", interest_period: "mensal", interest_count: "12",
  card_id: "", installments: "1", account_id: "",
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>
      {options.map(({ v, label, icon }) => {
        const isActive = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: "1 1 6rem",
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
const IcoPin        = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 4-7 13-7 13S5 13 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
const IcoRepeat     = <svg viewBox="0 0 24 24" width="14" height="14" className={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;

const KIND_OPTIONS = [
  { v: "despesa", label: "Despesa", icon: IcoArrowDown },
  { v: "receita", label: "Receita", icon: IcoArrowUp   },
];

const PAYMENT_OPTIONS = [
  { v: "a_vista",         label: "À vista",           icon: IcoBanknote },
  { v: "debito",          label: "Débito",            icon: IcoCard     },
  { v: "cartao_credito",  label: "Cartão de crédito", icon: IcoCard     },
];

const MODALITY_OPTIONS = [
  { v: "pontual",    label: "Pontual",    icon: IcoPin    },
  { v: "recorrente", label: "Recorrente", icon: IcoRepeat },
];

const END_TYPE_OPTIONS = [
  { v: "por_ocorrencias", label: "Nº de vezes" },
  { v: "por_data",        label: "Data final"  },
];

function _fromInitial(initial) {
  return {
    ...empty,
    ...initial,
    amount:          String(initial.amount ?? ""),
    interest_rate:   String(initial.interest_rate   ?? ""),
    interest_period: initial.interest_period        ?? "mensal",
    interest_count:  String(initial.interest_count  ?? "12"),
    card_id:         initial.card_id != null ? String(initial.card_id) : "",
    installments:    String(initial.installments ?? "1"),
    account_id:      initial.account_id != null ? String(initial.account_id) : "",
  };
}

// ── Main form ─────────────────────────────────────────────────────────────────

function _withCardDefault(f, cards) {
  if (!f.card_id && cards.length > 0) return { ...f, card_id: String(cards[0].id) };
  return f;
}

// Every transaction requires an account — default to the user's only
// account when there's just one, so most people never have to think about
// this field at all; with several accounts, leave it blank and make them pick.
function _withAccountDefault(f, accounts) {
  if (!f.account_id && accounts.length === 1) return { ...f, account_id: String(accounts[0].id) };
  return f;
}

export default function TransactionForm({ initial, onSubmit, onCancel, loading, categories = [], cards = [], accounts = [], requireAccount = true }) {
  const [form, setForm] = useState(
    _withAccountDefault(_withCardDefault(initial ? _fromInitial(initial) : empty, cards), accounts)
  );
  const [errors, setErrors] = useState([]);
  const [showInterest, setShowInterest] = useState(!!(initial?.interest_rate && !initial?.is_interest_child));

  useEffect(() => {
    if (initial) {
      setForm(_withAccountDefault(_withCardDefault(_fromInitial(initial), cards), accounts));
    }
  }, [initial]);

  useEffect(() => {
    setForm(f => _withAccountDefault(f, accounts));
  }, [accounts]);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function setKind(v) {
    setForm(f => ({ ...f, kind: v, payment_method: "a_vista", interest_rate: "" }));
    setShowInterest(false);
  }

  const isCard = form.kind === "despesa" && form.payment_method === "cartao_credito";

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);

    if (isCard) {
      // Shaped for /credit-purchases, not /transactions — payment_method
      // stays on the payload so the caller knows which endpoint to hit.
      const payload = {
        description: form.description,
        total_amount: form.amount,
        category: form.category || null,
        purchase_date: form.date,
        card_id: parseInt(form.card_id),
        type: form.type,
        payment_method: "cartao_credito",
      };
      if (form.type === "recorrente") {
        payload.frequency = form.frequency;
        payload.recurrence_end_type = form.recurrence_end_type;
        if (form.recurrence_end_type === "por_data") payload.recurrence_end_date = form.recurrence_end_date;
        else payload.recurrence_count = form.recurrence_count;
      } else {
        payload.installments = parseInt(form.installments) || 1;
      }
      try { await onSubmit(payload); }
      catch (err) { setErrors([err.message]); }
      return;
    }

    const payload = {
      description: form.description,
      amount: form.amount,
      kind: form.kind,
      type: form.type,
      date: form.date,
      category: form.category || null,
      payment_method: form.kind === "despesa" ? form.payment_method : "a_vista",
      account_id: form.account_id || null,
      interest_rate:   (showInterest && form.interest_rate) ? parseFloat(form.interest_rate) : null,
      interest_period: (showInterest && form.interest_rate) ? form.interest_period : null,
      interest_count:  (showInterest && form.interest_rate) ? parseInt(form.interest_count) || null : null,
    };
    if (payload.type === "recorrente") {
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

      {/* Amount + Kind — no cartão de crédito é sempre despesa, sem toggle */}
      <div className={isCard ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 min-[420px]:grid-cols-2 gap-4"}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
            <label className="label" style={{ margin: 0 }}>Valor (R$) *</label>
            {!isCard && (
              <button
                type="button"
                onClick={() => { setShowInterest(v => !v); if (showInterest) set("interest_rate", ""); }}
                style={{
                  fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.03em",
                  padding: "0.15rem 0.5rem", borderRadius: "999px", cursor: "pointer",
                  transition: "all 0.15s",
                  border: `1px solid ${showInterest ? "rgba(16,185,129,0.5)" : "var(--border-input)"}`,
                  backgroundColor: showInterest ? "rgba(16,185,129,0.1)" : "transparent",
                  color: showInterest ? "#10b981" : "var(--text-muted)",
                }}
              >
                % juros
              </button>
            )}
          </div>
          <input type="number" min="0.01" step="0.01" value={form.amount}
            onChange={e => set("amount", e.target.value)}
            placeholder="0,00" required className="input" />
          {/* Interest panel */}
          {!isCard && showInterest && (
            <div style={{ marginTop: "0.625rem", padding: "0.75rem", borderRadius: "0.75rem", border: "1px solid rgba(16,185,129,0.2)", backgroundColor: "rgba(16,185,129,0.04)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.625rem" }}>
                <div>
                  <label style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Taxa (%)</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={form.interest_rate}
                      onChange={e => set("interest_rate", e.target.value)}
                      placeholder="0,00"
                      className="input pr-6"
                      style={{ fontSize: "0.875rem" }}
                      autoFocus
                    />
                    <span style={{ position: "absolute", right: "0.6rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.72rem", color: "var(--text-muted)", pointerEvents: "none" }}>%</span>
                  </div>
                </div>
                <div>
                  <label style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Período</label>
                  <select value={form.interest_period} onChange={e => set("interest_period", e.target.value)} className="input" style={{ fontSize: "0.875rem" }}>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: "var(--text-secondary)", fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Qtd.</label>
                  <input
                    type="number" min="1" max="600" step="1"
                    value={form.interest_count}
                    onChange={e => set("interest_count", e.target.value)}
                    placeholder="12"
                    className="input"
                    style={{ fontSize: "0.875rem" }}
                  />
                </div>
              </div>
              {parseFloat(form.interest_rate) > 0 && parseInt(form.interest_count) > 0 && (
                <p style={{ fontSize: "0.72rem", color: "#10b981", marginTop: "0.5rem" }}>
                  {parseInt(form.interest_count)} {form.kind === "receita" ? "rendimentos" : "reajustes"} · taxa {form.interest_period === "mensal"
                    ? `≈ ${(((1 + parseFloat(form.interest_rate)/100)**12 - 1)*100).toFixed(1)}% a.a.`
                    : `${parseFloat(form.interest_rate).toFixed(2)}% a.a.`
                  }
                </p>
              )}
            </div>
          )}
        </div>
        {!isCard && (
          <div>
            <label className="label">Tipo *</label>
            <SegmentedGroup
              options={KIND_OPTIONS}
              value={form.kind}
              onChange={setKind}
              activeColor={form.kind === "receita" ? "green" : "red"}
            />
          </div>
        )}
      </div>

      {/* Date + Category */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
        <div>
          <label className="label">Data *</label>
          <input type="date" value={form.date}
            onChange={e => set("date", e.target.value)} required className="input" />
        </div>
        <div>
          <label className="label">Categoria</label>
          <CategoryInput value={form.category} onChange={v => set("category", v)} extraCategories={categories} />
        </div>
      </div>

      {/* Account — de onde sai / pra onde vai o dinheiro (não se aplica a cartão, que já usa a conta de pagamento do cartão, nem a cenários do simulador, que são hipotéticos) */}
      {!isCard && requireAccount && (
        <div>
          <label className="label">Conta *</label>
          <select value={form.account_id} onChange={e => set("account_id", e.target.value)} required className="input">
            <option value="" disabled>Selecione uma conta…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.bank ? ` — ${a.bank}` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* Payment method — apenas para despesas */}
      {form.kind === "despesa" && (
        <div>
          <label className="label">Forma de pagamento</label>
          <SegmentedGroup
            options={PAYMENT_OPTIONS}
            value={form.payment_method}
            onChange={v => set("payment_method", v)}
            activeColor="indigo"
          />
        </div>
      )}

      {/* Card + installments — só quando forma de pagamento é cartão */}
      {isCard && (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
          <div>
            <label className="label">Cartão *</label>
            <select value={form.card_id} onChange={e => set("card_id", e.target.value)} required className="input">
              {cards.length === 0 && <option value="">Nenhum cartão cadastrado</option>}
              {cards.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.bank ? ` — ${c.bank}` : ""}</option>
              ))}
            </select>
          </div>
          {form.type === "pontual" && (
            <div>
              <label className="label">Parcelas *</label>
              <input type="number" min="1" max="72" step="1" value={form.installments}
                onChange={e => set("installments", e.target.value)} className="input" />
            </div>
          )}
        </div>
      )}
      {isCard && form.type === "pontual" && parseInt(form.installments) > 1 && parseFloat(form.amount) > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "-0.75rem" }}>
          {parseInt(form.installments)}× de <strong>R$ {(parseFloat(form.amount) / parseInt(form.installments)).toFixed(2)}</strong> — uma cobrança em cada fatura mensal
        </p>
      )}

      {/* Pontual / Recorrente */}
      <div>
        <label className="label">Modalidade *</label>
        <SegmentedGroup
          options={MODALITY_OPTIONS}
          value={form.type}
          onChange={v => set("type", v)}
          activeColor="blue"
        />
      </div>

      {/* Recurrence options */}
      {form.type === "recorrente" && (
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
