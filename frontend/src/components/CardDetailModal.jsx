import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate } from "../utils/format";
import { useConfirm } from "./ConfirmDialog";
import TransactionForm from "./TransactionForm";
import EntryDetailModal from "./EntryDetailModal";
import { IconEdit, IconTrash, IconX, IconCreditCard } from "./Icons";

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 60, padding: "0.75rem 1rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669" }}>
      {toast.msg}
    </div>
  );
}

export default function CardDetailModal({ card, cards, categories, onClose, onChanged }) {
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPurchase, setEditingPurchase] = useState(null); // null | purchase
  const [detailPurchase, setDetailPurchase] = useState(null);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const { confirm, confirmEl } = useConfirm();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, inv] = await Promise.all([
        api.getCreditPurchases({ card_id: card.id }),
        api.getTransactions({ source_card_id: card.id }),
      ]);
      setPurchases(p.sort((a, b) => b.purchase_date.localeCompare(a.purchase_date)));
      setInvoices(inv.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, [card.id]);

  useEffect(() => { load(); }, [load]);

  async function handleEditSave(payload) {
    setSaveLoading(true);
    try {
      await api.updateCreditPurchase(editingPurchase.id, payload);
      showToast("Compra atualizada!");
      setEditingPurchase(null);
      await load();
      onChanged?.();
    } catch (err) { showToast(err.message, "error"); throw err; }
    finally { setSaveLoading(false); }
  }

  // Stable reference so TransactionForm's `initial` effect doesn't refire
  // (and reset in-progress input) whenever saveLoading changes this modal's render.
  const editingInitial = useMemo(() => (
    editingPurchase ? {
      ...editingPurchase,
      amount: editingPurchase.total_amount,
      date: editingPurchase.purchase_date,
      payment_method: "cartao_credito",
      kind: "despesa",
    } : null
  ), [editingPurchase]);

  async function handleDelete(purchase) {
    const ok = await confirm({
      title: "Excluir compra",
      message: `Tem certeza que deseja excluir "${purchase.description}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await api.deleteCreditPurchase(purchase.id);
      showToast("Compra excluída.");
      await load();
      onChanged?.();
    } catch (err) { showToast(err.message, "error"); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}
    >
      {confirmEl}
      <Toast toast={toast} />

      <div
        onClick={e => e.stopPropagation()}
        className="card w-full max-w-2xl p-6"
        style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / .4)", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 style={{ color: "var(--text-base)", fontSize: "0.9375rem", fontWeight: 600 }}>{card.name}</h2>
            {card.bank && <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "0.125rem" }}>{card.bank}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
        </div>

        {editingPurchase ? (
          <div className="space-y-4">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600 }}>Editar compra</p>
            <TransactionForm
              initial={editingInitial}
              cards={cards}
              categories={categories}
              loading={saveLoading}
              onSubmit={handleEditSave}
              onCancel={() => setEditingPurchase(null)}
            />
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Compras */}
            <div>
              <h3 style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.625rem" }}>
                Compras
              </h3>
              {purchases.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Nenhuma compra neste cartão ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {purchases.map(p => (
                    <div key={p.id} className="group flex items-center justify-between"
                      onClick={() => setDetailPurchase(p)}
                      style={{ padding: "0.625rem 0.75rem", borderRadius: "0.75rem", border: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ color: "var(--text-base)", fontWeight: 500, fontSize: "0.875rem" }}>
                          {p.description}
                          {p.installments > 1 && (
                            <span style={{ marginLeft: "0.375rem", fontSize: "0.7rem", fontWeight: 400, color: "var(--text-muted)" }}>
                              {p.installments}x
                            </span>
                          )}
                        </p>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.1rem" }}>
                          {formatDate(p.purchase_date)}{p.category ? ` · ${p.category}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ fontWeight: 600, color: "#f43f5e", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                          {formatBRL(p.total_amount)}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditingPurchase(p)} title="Editar"
                            style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <IconEdit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(p)} title="Excluir"
                            style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Faturas */}
            <div>
              <h3 style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.625rem" }}>
                Faturas
              </h3>
              {invoices.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Nenhuma fatura gerada ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between"
                      onClick={() => setDetailInvoice(inv)}
                      style={{ padding: "0.625rem 0.75rem", borderRadius: "0.75rem", backgroundColor: "var(--bg-muted)", cursor: "pointer" }}
                    >
                      <div className="flex items-center gap-2">
                        <IconCreditCard className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                        <p style={{ color: "var(--text-base)", fontSize: "0.875rem" }}>Vencimento {formatDate(inv.date)}</p>
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--text-base)", fontSize: "0.875rem" }}>
                        {formatBRL(inv.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "0.5rem" }}>
                Faturas são geradas automaticamente a partir das compras acima.
              </p>
            </div>
          </div>
        )}
      </div>

      {detailPurchase && (
        <EntryDetailModal
          title={detailPurchase.description}
          fields={[
            { label: "Valor", value: formatBRL(detailPurchase.total_amount), strong: true },
            { label: "Data da compra", value: formatDate(detailPurchase.purchase_date) },
            { label: "Categoria", value: detailPurchase.category },
            { label: "Cartão", value: card.name },
            ...(detailPurchase.installments > 1 ? [{ label: "Parcelas", value: `${detailPurchase.installments}x` }] : []),
            ...(detailPurchase.type === "recorrente" ? [{ label: "Recorrência", value: detailPurchase.frequency }] : []),
          ]}
          onClose={() => setDetailPurchase(null)}
          onEdit={() => { setDetailPurchase(null); setEditingPurchase(detailPurchase); }}
          onDelete={() => { setDetailPurchase(null); handleDelete(detailPurchase); }}
        />
      )}

      {detailInvoice && (
        <EntryDetailModal
          title={`Fatura ${card.name}`}
          badge={{ label: "Gerada automaticamente", bg: "rgba(99,102,241,0.12)", color: "#6366f1" }}
          fields={[
            { label: "Valor", value: formatBRL(detailInvoice.amount), strong: true },
            { label: "Vencimento", value: formatDate(detailInvoice.date) },
          ]}
          note="Esta fatura é gerada automaticamente a partir das compras no cartão."
          onClose={() => setDetailInvoice(null)}
        />
      )}
    </div>
  );
}
