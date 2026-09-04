import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate, today, addMonths } from "../utils/format";
import BalanceChart from "../components/BalanceChart";
import TransactionForm from "../components/TransactionForm";
import { IconPlus, IconEdit, IconTrash, IconX, IconCheck } from "../components/Icons";

// ── helpers ──────────────────────────────────────────────────────────────────

let _nextId = -1;
function tempId() { return _nextId--; }

function freqLabel(f) {
  return { semanal: "Semanal", mensal: "Mensal", anual: "Anual" }[f] ?? f;
}

// ── sub-components ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}>
      <div className="card w-full max-w-lg p-6" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SummaryPill({ label, value, positive }) {
  const color = positive === null ? "var(--text-base)"
    : positive ? "#10b981" : "#f43f5e";
  return (
    <div className="card p-4 flex flex-col gap-1">
      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ color, fontSize: "1.125rem", fontWeight: 700 }}>{value ?? "—"}</p>
    </div>
  );
}

function DeltaPill({ label, real, sim }) {
  const delta = (sim ?? 0) - (real ?? 0);
  const pos = delta >= 0;
  return (
    <div className="card p-4 flex flex-col gap-1">
      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ color: "var(--text-base)", fontSize: "1rem", fontWeight: 700 }}>{formatBRL(sim)}</p>
      {real !== undefined && (
        <p style={{ fontSize: "0.75rem", color: pos ? "#10b981" : "#f43f5e", fontWeight: 500 }}>
          {pos ? "+" : ""}{formatBRL(delta)} vs atual
        </p>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Simulator() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate]     = useState(addMonths(today(), 12));

  // real projection (reference, never edited)
  const [realProjection, setRealProjection]   = useState(null);
  const [realLoading, setRealLoading]         = useState(true);

  // simulated transactions (local copy, editable)
  const [simTxs, setSimTxs]                   = useState(null); // null = not loaded yet
  const [simProjection, setSimProjection]     = useState(null);
  const [simLoading, setSimLoading]           = useState(false);

  const [categories, setCategories]           = useState([]);
  const [modal, setModal]                     = useState(null); // null | { mode: "add" | "edit", tx }
  const debounceRef                           = useRef(null);

  // ── load real data on mount / date change ──────────────────────────────────
  useEffect(() => {
    loadReal();
  }, [startDate, endDate]);

  async function loadReal() {
    setRealLoading(true);
    try {
      const [proj, txs, cats] = await Promise.all([
        api.getProjection({ start: startDate, end: endDate }),
        api.getTransactions(),
        api.getCategories(),
      ]);
      setRealProjection(proj);
      setCategories(cats);
      // initialise sim state from real transactions (deep copy)
      setSimTxs(txs.map(t => ({ ...t })));
    } finally {
      setRealLoading(false);
    }
  }

  // ── re-run simulation whenever simTxs or dates change ─────────────────────
  useEffect(() => {
    if (!simTxs) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSimulate, 300);
    return () => clearTimeout(debounceRef.current);
  }, [simTxs, startDate, endDate]);

  async function runSimulate() {
    setSimLoading(true);
    try {
      const result = await api.simulate({
        start: startDate,
        end: endDate,
        transactions: simTxs,
      });
      setSimProjection(result);
    } finally {
      setSimLoading(false);
    }
  }

  // ── transaction CRUD on local state ───────────────────────────────────────
  function handleAdd(payload) {
    const tx = {
      ...payload,
      id: tempId(),
      amount: parseFloat(payload.amount),
    };
    setSimTxs(prev => [...prev, tx]);
    setModal(null);
  }

  function handleEdit(payload) {
    setSimTxs(prev => prev.map(t =>
      t.id === modal.tx.id ? { ...t, ...payload, amount: parseFloat(payload.amount) } : t
    ));
    setModal(null);
  }

  function handleDelete(id) {
    setSimTxs(prev => prev.filter(t => t.id !== id));
  }

  function handleReset() {
    loadReal();
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const realS  = realProjection?.summary;
  const simS   = simProjection?.summary;

  // transactions added/modified in sim vs real
  const realIds = new Set((realProjection ? simTxs?.filter(t => t.id > 0).map(t => t.id) : []));
  const addedTxs    = (simTxs ?? []).filter(t => t.id < 0);
  const removedCount = realProjection
    ? (api._realTxCount ?? 0) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Simulador de Cenários</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
            Edite, adicione ou remova lançamentos sem alterar seus dados reais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
          <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>até</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
        </div>
      </div>

      {/* Summary comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryPill label="Saldo final — Atual"     value={formatBRL(realS?.final_balance)} positive={realS?.final_balance >= 0 ? true : false} />
        <DeltaPill   label="Saldo final — Simulado"  real={realS?.final_balance} sim={simS?.final_balance} />
        <SummaryPill label="Menor saldo — Atual"     value={formatBRL(realS?.min_balance)}   positive={realS?.min_balance >= 0 ? true : false} />
        <DeltaPill   label="Menor saldo — Simulado"  real={realS?.min_balance}  sim={simS?.min_balance}  />
      </div>

      {/* Dual chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
              Projeção atual
            </p>
          </div>
          <BalanceChart data={realProjection?.chart} loading={realLoading} />
        </div>
        <div className="card p-5" style={{ border: "1px solid rgba(37,99,235,0.35)" }}>
          <p style={{ color: "#2563eb", fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>
            Cenário simulado {simLoading && <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.75rem" }}>atualizando…</span>}
          </p>
          <BalanceChart data={simProjection?.chart} loading={realLoading || (simLoading && !simProjection)} />
        </div>
      </div>

      {/* Transaction editor */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>Lançamentos do cenário</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.125rem" }}>
              Alterações aqui não afetam seus dados reais
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} className="btn-ghost text-xs" style={{ border: "1px solid var(--border)" }}>
              Resetar
            </button>
            <button onClick={() => setModal({ mode: "add", tx: null })} className="btn-primary text-xs flex items-center gap-1.5">
              <IconPlus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
        </div>

        {!simTxs ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
            ))}
          </div>
        ) : simTxs.length === 0 ? (
          <div className="py-10 text-center">
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhum lançamento no cenário.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "580px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Data", "Descrição", "Tipo", "Valor", ""].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {simTxs.map(tx => {
                  const isNew = tx.id < 0;
                  return (
                    <tr key={tx.id} className="group transition-colors"
                      style={{ borderTop: "1px solid var(--border)" }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {formatDate(tx.date)}
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-base)", fontWeight: 500 }}>
                        <span>{tx.description}</span>
                        {tx.type === "recorrente" && (
                          <span style={{ marginLeft: "0.375rem", fontSize: "0.72rem", color: "#60a5fa", fontWeight: 400 }}>
                            · {freqLabel(tx.frequency)}
                          </span>
                        )}
                        {isNew && (
                          <span style={{ marginLeft: "0.375rem", fontSize: "0.7rem", backgroundColor: "rgba(37,99,235,0.12)", color: "#2563eb", padding: "0.1rem 0.4rem", borderRadius: "9999px", fontWeight: 600 }}>
                            novo
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        {tx.kind === "receita"
                          ? <span className="badge-green">↑ Receita</span>
                          : <span className="badge-red">↓ Despesa</span>
                        }
                      </td>
                      <td style={{ padding: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", color: tx.kind === "receita" ? "#10b981" : "#f43f5e" }}>
                        {tx.kind === "receita" ? "+" : "−"}{formatBRL(tx.amount)}
                      </td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModal({ mode: "edit", tx })} title="Editar"
                            style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <IconEdit />
                          </button>
                          <button onClick={() => handleDelete(tx.id)} title="Remover do cenário"
                            style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal add/edit */}
      {modal && (
        <Modal
          title={modal.mode === "add" ? "Adicionar ao cenário" : "Editar no cenário"}
          onClose={() => setModal(null)}
        >
          <TransactionForm
            initial={modal.tx ?? undefined}
            onSubmit={modal.mode === "add" ? handleAdd : handleEdit}
            onCancel={() => setModal(null)}
            loading={false}
            categories={categories}
            requireAccount={false}
          />
        </Modal>
      )}
    </div>
  );
}
