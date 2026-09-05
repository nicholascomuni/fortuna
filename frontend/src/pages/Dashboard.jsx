import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate, today, addMonths } from "../utils/format";
import SummaryCard from "../components/SummaryCard";
import BalanceChart from "../components/BalanceChart";
import TransactionTable from "../components/TransactionTable";
import TransactionForm from "../components/TransactionForm";
import EditTransactionForm from "../components/EditTransactionForm";
import ParcelarFaturaModal from "../components/ParcelarFaturaModal";
import { useConfirm } from "../components/ConfirmDialog";
import {
  IconTrendingUp, IconTrendingDown, IconWallet,
  IconAlertTriangle, IconFilter, IconX, IconMaximize,
} from "../components/Icons";

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(8px)" }}>
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
  const [loading, setLoading]        = useState(true);
  const [categories, setCategories]  = useState([]);

  const [startDate, setStartDate]   = useState(today());
  const [endDate, setEndDate]       = useState(addMonths(today(), 12));
  const [filterKind, setFilterKind]       = useState("");
  const [filterCat, setFilterCat]         = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [search, setSearch]               = useState("");

  const { confirm, confirmEl }            = useConfirm();
  const [editing, setEditing]             = useState(null);
  const [parcelando, setParcelando]       = useState(null);
  const [saveLoading, setSaveLoading]     = useState(false);
  const [toast, setToast]                 = useState(null);
  const [cards, setCards]                 = useState([]);
  const [accounts, setAccounts]           = useState([]);
  const [chartExpanded, setChartExpanded] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [proj, cats, cardsData, accountsData] = await Promise.all([
        api.getProjection({ start: startDate, end: endDate }),
        api.getCategories(),
        api.getCards(),
        api.getAccounts(),
      ]);
      setProjection(proj);
      setCategories(cats);
      setCards(cardsData);
      setAccounts(accountsData);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  // The floating "Nova movimentação" button is global (rendered in Layout,
  // reachable from every page) — it fires this event on success so we know
  // to refresh, without it needing to know about this page's state.
  useEffect(() => {
    function handleChanged() { load(); }
    window.addEventListener("finance:changed", handleChanged);
    return () => window.removeEventListener("finance:changed", handleChanged);
  }, [load]);

  const filteredRows = (projection?.rows ?? []).filter(r => {
    if (filterKind && r.kind !== filterKind) return false;
    if (filterCat  && r.category !== filterCat) return false;
    if (filterAccount && String(r.account_id ?? "") !== filterAccount) return false;
    if (search && !r.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleOpenEdit(row) {
    if (row.source === "credit_invoice") {
      setParcelando(row);
      return;
    }
    if (row.source === "credit_purchase") {
      setEditing({ ...row, id: row.purchase_id, payment_method: "cartao_credito" });
      return;
    }
    let txId = row.id ?? row.transaction_id;
    if (!txId) return;
    try {
      const txs = await api.getTransactions();
      let tx = txs.find(t => t.id === txId) ?? row;
      // If it's an interest child, open the parent instead — unless that
      // parent is itself a parceled fatura, which has its own edit flow.
      if (tx.is_interest_child && tx.parent_id) {
        tx = txs.find(t => t.id === tx.parent_id) ?? tx;
      }
      if (tx.source === "credit_invoice") {
        setParcelando(tx);
      } else {
        setEditing(tx);
      }
    } catch { setEditing(row); }
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
      showToast(
        rowOrId.interest_rate
          ? "Para desfazer o parcelamento, exclua uma das parcelas geradas por ele."
          : "Esta fatura é gerada automaticamente a partir das compras no cartão. Edite as compras em Cartões, ou parcele a fatura pelo botão Editar.",
        "error"
      );
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
      // ids come from TransactionTable's selectionId() — "tx:<id>" for
      // regular transactions (incl. interest children), "purchase:<id>"
      // for card purchases — each needs a different delete endpoint.
      await Promise.all(ids.map(id => {
        const [kind, rawId] = id.split(":");
        return kind === "purchase" ? api.deleteCreditPurchase(rawId) : api.deleteTransaction(rawId);
      }));
      showToast(`${ids.length} movimentação(ões) excluída(s).`);
      load();
    } catch (err) { showToast(err.message, "error"); }
  }

  const s = projection?.summary;
  const hasFilters = filterKind || filterCat || filterAccount || search;

  return (
    <div className="space-y-5">
      <Toast toast={toast} />
      {confirmEl}

      {editing && (
        <Modal title={editing.source === "credit_purchase" ? "Editar compra no cartão" : "Editar movimentação"} onClose={() => setEditing(null)}>
          {editing.source === "credit_purchase" ? (
            <TransactionForm initial={editing} cards={cards} accounts={accounts} onSubmit={handleEditSave}
              onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
          ) : (
            <EditTransactionForm initial={editing} onSubmit={handleEditSave}
              onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
          )}
        </Modal>
      )}

      {parcelando && (
        <ParcelarFaturaModal
          transaction={{ ...parcelando, id: parcelando.id ?? parcelando.transaction_id }}
          onClose={() => setParcelando(null)}
          onDone={() => { setParcelando(null); showToast("Fatura parcelada!"); load(); }}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Dashboard</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">Visão geral das suas finanças</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-4">
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
            onClick={() => setChartExpanded(true)}
            className="btn-ghost p-1.5 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            title="Expandir gráfico"
          >
            <IconMaximize className="w-4 h-4" />
          </button>
        </div>
        <BalanceChart data={projection?.chart} transactions={filteredRows} loading={loading} />
      </div>

      {/* Expanded chart — fullscreen, works in mobile landscape too */}
      {chartExpanded && (
        <div
          onClick={() => setChartExpanded(false)}
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", zIndex: 60, backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", padding: "1rem" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ flex: 1, padding: "1rem", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgb(0 0 0 / .5)" }}
          >
            <div className="flex items-center justify-between mb-2" style={{ flexShrink: 0 }}>
              <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>
                Saldo ao longo do tempo
              </h2>
              <button onClick={() => setChartExpanded(false)} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <BalanceChart data={projection?.chart} transactions={filteredRows} loading={loading} fill />
            </div>
          </div>
        </div>
      )}

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
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">Conta</label>
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="input text-sm">
              <option value="">Todas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">Buscar</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Descrição…" className="input text-sm" />
          </div>
          <div className="flex gap-2 ml-auto">
            {hasFilters && (
              <button onClick={() => { setFilterKind(""); setFilterCat(""); setFilterAccount(""); setSearch(""); }}
                className="btn-ghost text-xs flex items-center gap-1"
                style={{ border: "1px solid var(--border)" }}>
                <IconX className="w-3 h-3" /> Limpar
              </button>
            )}
            <button onClick={load} className="btn-ghost text-xs" style={{ border: "1px solid var(--border)" }}>
              Atualizar
            </button>
          </div>
        </div>

        <TransactionTable rows={filteredRows} loading={loading} onEdit={handleOpenEdit} onDelete={handleDelete} onBulkDelete={handleBulkDelete} cards={cards} />
      </div>
    </div>
  );
}
