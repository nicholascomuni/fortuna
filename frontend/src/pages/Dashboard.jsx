import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate, today, addMonths } from "../utils/format";
import SummaryCard from "../components/SummaryCard";
import BalanceChart from "../components/BalanceChart";
import TransactionTable from "../components/TransactionTable";
import TransactionForm from "../components/TransactionForm";
import CreditPurchaseForm from "../components/CreditPurchaseForm";
import { useConfirm } from "../components/ConfirmDialog";
import {
  IconTrendingUp, IconTrendingDown, IconWallet,
  IconAlertTriangle, IconPlus, IconFilter, IconX,
} from "../components/Icons";

const ENTRY_MODES = [
  { v: "comum",   label: "Despesa/Receita comum" },
  { v: "credito", label: "Compra no cartão" },
];

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

  const { confirm, confirmEl }            = useConfirm();
  const [adding, setAdding]               = useState(false);
  const [entryMode, setEntryMode]         = useState("comum");
  const [addLoading, setAddLoading]       = useState(false);
  const [editing, setEditing]             = useState(null);
  const [saveLoading, setSaveLoading]     = useState(false);
  const [toast, setToast]                 = useState(null);
  const [balanceModal, setBalanceModal]   = useState(false);
  const [balanceInput, setBalanceInput]   = useState("");
  const [savingBalance, setSavingBalance] = useState(false);
  const [cards, setCards]                 = useState([]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [proj, sett, cats, cardsData] = await Promise.all([
        api.getProjection({ start: startDate, end: endDate }),
        api.getSettings(),
        api.getCategories(),
        api.getCards(),
      ]);
      setProjection(proj);
      setSettings(sett);
      setCategories(cats);
      setCards(cardsData);
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

  function openBalanceModal() {
    setBalanceInput(settings?.initial_balance?.toString() ?? "0");
    setBalanceModal(true);
  }

  async function handleSaveBalance(e) {
    e.preventDefault();
    setSavingBalance(true);
    try {
      await api.updateSettings({ initial_balance: parseFloat(balanceInput), initial_balance_date: today() });
      showToast("Saldo inicial atualizado!");
      setBalanceModal(false);
      load();
    } catch (err) { showToast(err.message, "error"); }
    finally { setSavingBalance(false); }
  }

  async function handleOpenEdit(row) {
    if (row.source === "credit_invoice") {
      showToast("Esta fatura é gerada automaticamente. Edite as compras em Cartões.", "error");
      return;
    }
    if (row.source === "credit_purchase") {
      setEditing({ ...row, id: row.purchase_id });
      return;
    }
    let txId = row.id ?? row.transaction_id;
    if (!txId) return;
    try {
      const txs = await api.getTransactions();
      let tx = txs.find(t => t.id === txId) ?? row;
      // If it's an interest child, open the parent instead
      if (tx.is_interest_child && tx.parent_id) {
        tx = txs.find(t => t.id === tx.parent_id) ?? tx;
      }
      setEditing(tx);
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

  async function handleAddPurchaseSave(payload) {
    setAddLoading(true);
    try {
      await api.createCreditPurchase(payload);
      showToast("Compra no cartão adicionada!");
      setAdding(false); load();
    } catch (err) { showToast(err.message, "error"); throw err; }
    finally { setAddLoading(false); }
  }

  async function handleEditSave(payload) {
    setSaveLoading(true);
    try {
      if (editing.source === "credit_purchase") {
        await api.updateCreditPurchase(editing.id, payload);
      } else {
        await api.updateTransaction(editing.id, payload);
      }
      showToast(editing.source === "credit_purchase" ? "Compra atualizada!" : "Movimentação atualizada!");
      setEditing(null); load();
    } finally { setSaveLoading(false); }
  }

  async function handleDelete(rowOrId) {
    if (typeof rowOrId === "object" && rowOrId.source === "credit_invoice") {
      showToast("Esta fatura é gerada automaticamente. Edite as compras em Cartões.", "error");
      return;
    }
    if (typeof rowOrId === "object" && rowOrId.source === "credit_purchase") {
      const ok = await confirm({ title: "Excluir compra no cartão", message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir" });
      if (!ok) return;
      try {
        await api.deleteCreditPurchase(rowOrId.purchase_id);
        showToast("Compra excluída.");
        load();
      } catch (err) { showToast(err.message, "error"); }
      return;
    }
    const txId = typeof rowOrId === "object" ? (rowOrId.id ?? rowOrId.transaction_id) : rowOrId;
    if (!txId) return;
    const ok = await confirm({ title: "Excluir movimentação", message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir" });
    if (!ok) return;
    try {
      await api.deleteTransaction(txId);
      showToast("Movimentação excluída.");
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  async function handleBulkDelete(ids) {
    const ok = await confirm({ title: `Excluir ${ids.length} movimentação(ões)?`, message: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir tudo" });
    if (!ok) return;
    try {
      await Promise.all(ids.map(id => api.deleteTransaction(id)));
      showToast(`${ids.length} movimentação(ões) excluída(s).`);
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  const s = projection?.summary;
  const hasFilters = filterKind || filterCat;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      {confirmEl}

      {adding && (
        <Modal title="Nova movimentação" onClose={() => setAdding(false)}>
          <div className="space-y-5">
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {ENTRY_MODES.map(({ v, label }) => {
                const isActive = entryMode === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEntryMode(v)}
                    style={{
                      flex: 1,
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.75rem",
                      fontSize: "0.8125rem",
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      border: `1px solid ${isActive ? "rgba(37,99,235,0.4)" : "var(--border-input)"}`,
                      backgroundColor: isActive ? "rgba(37,99,235,0.1)" : "transparent",
                      color: isActive ? "#2563eb" : "var(--text-secondary)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {entryMode === "comum" ? (
              <TransactionForm onSubmit={handleAddSave}
                onCancel={() => setAdding(false)} loading={addLoading} categories={categories} />
            ) : cards.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  Você ainda não tem cartões cadastrados. Cadastre um na aba{" "}
                  <a href="/cartoes" style={{ color: "#2563eb", fontWeight: 600 }}>Cartões</a> primeiro.
                </p>
              </div>
            ) : (
              <CreditPurchaseForm cards={cards} onSubmit={handleAddPurchaseSave}
                onCancel={() => setAdding(false)} loading={addLoading} categories={categories} />
            )}
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.source === "credit_purchase" ? "Editar compra no cartão" : "Editar movimentação"} onClose={() => setEditing(null)}>
          {editing.source === "credit_purchase" ? (
            <CreditPurchaseForm initial={editing} cards={cards} onSubmit={handleEditSave}
              onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
          ) : (
            <TransactionForm initial={editing} onSubmit={handleEditSave}
              onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
          )}
        </Modal>
      )}

      {/* Balance modal */}
      {balanceModal && (
        <div
          onClick={() => setBalanceModal(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ width: "100%", maxWidth: "22rem", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)", display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>Saldo inicial</p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "0.125rem" }}>
                  Valor de referência para o cálculo do saldo projetado
                </p>
              </div>
              <button
                onClick={() => setBalanceModal(false)}
                className="btn-ghost p-1.5 rounded-lg"
                style={{ flexShrink: 0 }}
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* Current balance display */}
            {settings?.initial_balance != null && (
              <div style={{ padding: "0.875rem 1rem", borderRadius: "0.875rem", backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Saldo atual</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, color: settings.initial_balance >= 0 ? "#10b981" : "#f43f5e" }}>
                  {formatBRL(settings.initial_balance)}
                </p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveBalance} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label className="label">Novo saldo</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.8125rem", color: "var(--text-muted)", pointerEvents: "none" }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={balanceInput}
                    onChange={e => setBalanceInput(e.target.value)}
                    className="input"
                    style={{ paddingLeft: "2.25rem" }}
                    autoFocus
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setBalanceModal(false)}
                  className="btn-ghost px-4 py-2 text-sm"
                  style={{ border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={savingBalance} className="btn-primary py-2 px-5 text-sm">
                  {savingBalance ? "…" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Dashboard</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">Visão geral das suas finanças</p>
        </div>
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
        </div>
        <BalanceChart data={projection?.chart} loading={loading} />
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
            <button
              onClick={openBalanceModal}
              className="btn-ghost text-xs flex items-center gap-1.5"
              style={{ border: "1px solid var(--border)" }}
              title="Definir saldo inicial"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              Saldo
            </button>
            <button onClick={load} className="btn-ghost text-xs" style={{ border: "1px solid var(--border)" }}>
              Atualizar
            </button>
            <button onClick={() => { setEntryMode("comum"); setAdding(true); }} className="btn-primary text-xs flex items-center gap-1.5">
              <IconPlus className="w-3.5 h-3.5" /> Nova
            </button>
          </div>
        </div>

        <TransactionTable rows={filteredRows} loading={loading} onEdit={handleOpenEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} cards={cards} />
      </div>
    </div>
  );
}
