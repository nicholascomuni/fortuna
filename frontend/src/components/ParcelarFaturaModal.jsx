import { useState } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate } from "../utils/format";
import { IconX } from "./Icons";

// Opened from a "Fatura X" row's Editar action. A fatura's only meaningful
// edit is financing it ("parcelar") — freely rewriting its amount/date
// wouldn't make sense for a value that's derived from real card charges.
export default function ParcelarFaturaModal({ transaction, onClose, onDone }) {
  const alreadyParceled = !!transaction.interest_rate;
  const [count, setCount] = useState("3");
  const [rate, setRate] = useState("");
  const [period, setPeriod] = useState("mensal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.parcelarFatura(transaction.id, {
        interest_count: parseInt(count),
        interest_rate: parseFloat(rate),
        interest_period: period,
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const firstInstallment = transaction.amount / (parseInt(count) || 1);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
    >
      <div onClick={e => e.stopPropagation()} className="card w-full max-w-md p-6" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>{transaction.description}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
        </div>

        {alreadyParceled ? (
          <div className="space-y-3">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Esta fatura já está parcelada em <strong>{transaction.interest_count + 1}x</strong>, com juros de{" "}
              <strong>{transaction.interest_rate}%</strong> {transaction.interest_period === "mensal" ? "ao mês" : "ao ano"}.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              Para desfazer o parcelamento, exclua qualquer uma das parcelas na tabela — isso remove o plano inteiro, e a fatura volta a ser gerada normalmente a partir das compras no cartão.
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-primary text-sm">Entendi</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Valor total: <strong style={{ color: "var(--text-base)" }}>{formatBRL(transaction.amount)}</strong> · vencimento {formatDate(transaction.date)}
            </p>

            {error && (
              <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem" }}>
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
              <div>
                <label className="label">Parcelas</label>
                <input type="number" min="2" max="60" step="1" value={count} onChange={e => setCount(e.target.value)} required className="input" />
              </div>
              <div>
                <label className="label">Taxa (%)</label>
                <input type="number" min="0.01" step="0.01" value={rate} onChange={e => setRate(e.target.value)} required className="input" placeholder="0,00" />
              </div>
              <div>
                <label className="label">Período</label>
                <select value={period} onChange={e => setPeriod(e.target.value)} className="input">
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                </select>
              </div>
            </div>

            {parseFloat(rate) > 0 && parseInt(count) > 1 && (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                1ª parcela em {formatDate(transaction.date)}: <strong style={{ color: "var(--text-base)" }}>{formatBRL(firstInstallment)}</strong>.
                As demais {parseInt(count) - 1} crescem {rate}% {period === "mensal" ? "ao mês" : "ao ano"} sobre esse valor, uma por período.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost text-sm" style={{ padding: "0.5rem 1rem" }}>Cancelar</button>
              <button type="submit" disabled={loading} className="btn-primary text-sm">
                {loading ? "Parcelando…" : "Parcelar fatura"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
