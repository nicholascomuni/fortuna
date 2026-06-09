import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate, today, addMonths } from "../utils/format";
import SummaryCard from "../components/SummaryCard";
import BalanceChart from "../components/BalanceChart";
import TransactionTable from "../components/TransactionTable";
import TransactionForm from "../components/TransactionForm";
import {
  IconTrendingUp, IconTrendingDown, IconWallet,
  IconAlertTriangle, IconPlus, IconFilter, IconX,
} from "../components/Icons";

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}>
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
    <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, padding: "0.75rem 1rem", borderRadius: "0.75rem", boxShadow: "0 10px 15px -3px rgb(0 0 0 / .1)", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669", display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {toast.type === "error" ? "✕" : "✓"} {toast.msg}
    </div>
  );
}

export default function Dashboard() {
  const [projection, setProjection] = useState(null);
  const [settings, setSettings]     = useState(null);
  const [loading, setLoading]        = useState(true);
  const [categories, setCategories]  = useState([]);

  const [startDate, setStartDate]   = useState(today());
  const [endDate, setEndDate]       = useState(addMonths(today(), 12));
  const [filterKind, setFilterKind] = useState("");
  const [filterCat, setFilterCat]   = useState("");

  const [showCredit, setShowCredit]   = useState(false);
  const [adding, setAdding]           = useState(false);
  const [addLoading, setAddLoading]   = useState(false);
  const [editing, setEditing]         = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toast, setToast]             = useState(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [proj, sett, cats] = await Promise.all([
        api.getProjection({ start: startDate, end: endDate }),
        api.getSettings(),
        api.getCategories(),
      ]);
      setProjection(proj);
      setSettings(sett);
      setCategories(cats);
      setBalanceInput(sett.initial_balance?.toString() ?? "0");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = (projection?.rows ?? []).filter(r => {
    if (filterKind && r.kind !== filterKind) return false;
    if (filterCat  && r.category !== filterCat) return false;
    return true;
  });

  async function handleSaveBalance(e) {
    e.preventDefault();
    setSavingBalance(true);
    try {
      await api.updateSettings({ initial_balance: parseFloat(balanceInput), initial_balance_date: today() });
      showToast("Saldo inicial atualizado!");
      load();
    } catch (err) { showToast(err.message, "error"); }
    finally { setSavingBalance(false); }
  }

  async function handleOpenEdit(row) {
    const txId = row.id ?? row.transaction_id;
    if (!txId) return;
    try {
      const txs = await api.getTransactions({ type: row.type });
      setEditing(txs.find(t => t.id === txId) ?? row);
    } catch { setEditing(row); }
  }

  async function handleAddSave(payload) {
    setAddLoading(true);
    try {
      await api.createTransaction(payload);
      showToast("Movimentação adicionada!");
      setAdding(false); load();
    } catch (err) { showToast(err.message, "error"); }
    finally { setAddLoading(false); }
  }

  async function handleEditSave(payload) {
    setSaveLoading(true);
    try {
      await api.updateTransaction(editing.id, payload);
      showToast("Movimentação atualizada!");
      setEditing(null); load();
    } finally { setSaveLoading(false); }
  }

  async function handleDelete(rowOrId) {
    const txId = typeof rowOrId === "object" ? (rowOrId.id ?? rowOrId.transaction_id) : rowOrId;
    if (!txId || !confirm("Excluir esta movimentação?")) return;
    try {
      await api.deleteTransaction(txId);
      showToast("Movimentação excluída.");
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  const s = projection?.summary;
  const hasFilters = filterKind || filterCat;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {adding && (
        <Modal title="Nova movimentação" onClose={() => setAdding(false)}>
          <TransactionForm onSubmit={handleAddSave}
            onCancel={() => setAdding(false)} loading={addLoading} categories={categories} />
        </Modal>
      )}

      {editing && (
        <Modal title="Editar movimentação" onClose={() => setEditing(null)}>
          <TransactionForm initial={editing} onSubmit={handleEditSave}
            onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
        </Modal>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Dashboard</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">Visão geral das suas finanças</p>
        </div>

        <form onSubmit={handleSaveBalance} className="flex items-center gap-2">
          <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium whitespace-nowrap">Saldo inicial</label>
          <div className="relative">
            <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted)" }}>R$</span>
            <input type="number" step="0.01" value={balanceInput} onChange={e => setBalanceInput(e.target.value)} className="input pl-8 w-32 text-sm" />
          </div>
          <button type="submit" disabled={savingBalance} className="btn-primary py-2 text-xs">
            {savingBalance ? "…" : "Salvar"}
          </button>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Receitas" value={formatBRL(s?.total_receitas)} color="green" icon={IconTrendingUp} loading={loading} />
        <SummaryCard title="Despesas" value={formatBRL(s?.total_despesas)} color="red" icon={IconTrendingDown} loading={loading} />
        <SummaryCard title="Saldo projetado" value={formatBRL(s?.final_balance)} sub="ao final do período" color={s?.final_balance >= 0 ? "blue" : "red"} icon={IconWallet} loading={loading} />
        <SummaryCard title="Menor saldo" value={formatBRL(s?.min_balance)} sub={s?.min_balance_date ? `em ${formatDate(s.min_balance_date)}` : ""} color={s?.min_balance >= 0 ? "yellow" : "red"} icon={IconAlertTriangle} loading={loading} />
      </div>

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ color: "var(--text-secondary)", fontSize: "0.875rem", fontWeight: 600 }}>
            Saldo ao longo do tempo
          </h2>
          <button
            type="button"
            onClick={() => setShowCredit(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "999px",
              fontSize: "0.75rem", fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
              border: `1px solid ${showCredit ? "rgba(168,85,247,0.45)" : "var(--border-input)"}`,
              backgroundColor: showCredit ? "rgba(168,85,247,0.1)" : "transparent",
              color: showCredit ? "#a855f7" : "var(--text-muted)",
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            Fatura crédito
          </button>
        </div>
        <BalanceChart data={projection?.chart} loading={loading} showCredit={showCredit} />
      </div>

      {/* Filters + Table */}
      <div className="card p-5">
        <div className="flex flex-wrap gap-3 items-end mb-5">
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">De</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input text-sm w-38" />
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">Até</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input text-sm w-38" />
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 flex items-center gap-1">
              <IconFilter />Tipo
            </label>
            <select value={filterKind} onChange={e => setFilterKind(e.target.value)} className="input text-sm">
              <option value="">Todos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">Categoria</label>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input text-sm">
              <option value="">Todas</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            {hasFilters && (
              <button onClick={() => { setFilterKind(""); setFilterCat(""); }}
                className="btn-ghost text-xs flex items-center gap-1"
                style={{ border: "1px solid var(--border)" }}>
                <IconX className="w-3 h-3" /> Limpar
              </button>
            )}
            <button onClick={load} className="btn-ghost text-xs" style={{ border: "1px solid var(--border)" }}>
              Atualizar
            </button>
            <button onClick={() => setAdding(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <IconPlus className="w-3.5 h-3.5" /> Nova
            </button>
          </div>
        </div>

        <TransactionTable rows={filteredRows} loading={loading} onEdit={handleOpenEdit} onDelete={handleDelete} />
      </div>
    </div>
  );
}
