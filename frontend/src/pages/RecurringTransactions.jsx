import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatBRL, formatDate } from "../utils/format";
import TransactionForm from "../components/TransactionForm";
import { useConfirm } from "../components/ConfirmDialog";
import { IconEdit, IconTrash, IconX } from "../components/Icons";

const freqLabel = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" };

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}>
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

export default function RecurringTransactions() {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [toast, setToast]             = useState(null);
  const [categories, setCategories]   = useState([]);
  const { confirm, confirmEl }        = useConfirm();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [data, cats] = await Promise.all([api.getRecurring(), api.getCategories()]);
      setRows(data); setCategories(cats);
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  async function handleEditSave(payload) {
    setSaveLoading(true);
    try {
      await api.updateTransaction(editing.id, payload);
      showToast("Recorrência atualizada!");
      setEditing(null); load();
    } catch (err) { showToast(err.message, "error"); }
    finally { setSaveLoading(false); }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: "Excluir recorrência",
      message: "Ela sumirá de todas as projeções futuras. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try { await api.deleteTransaction(id); showToast("Recorrência excluída."); load(); }
    catch (err) { showToast(err.message, "error"); }
  }

  function endDescription(row) {
    if (row.recurrence_end_type === "por_data" && row.recurrence_end_date)
      return `até ${formatDate(row.recurrence_end_date)}`;
    if (row.recurrence_end_type === "por_ocorrencias" && row.recurrence_count)
      return `${row.recurrence_count}×`;
    return "—";
  }

  return (
    <div className="space-y-5">
      {confirmEl}
      {toast && (
        <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, padding: "0.75rem 1rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669" }}>
          {toast.msg}
        </div>
      )}

      {editing && (
        <Modal title="Editar recorrência" onClose={() => setEditing(null)}>
          <TransactionForm initial={editing} onSubmit={handleEditSave}
            onCancel={() => setEditing(null)} loading={saveLoading} categories={categories} />
        </Modal>
      )}

      <div>
        <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Movimentações recorrentes</h1>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
          Regras de recorrência — editar aqui atualiza todas as projeções
        </p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <div style={{ width: "3rem", height: "3rem", borderRadius: "1rem", backgroundColor: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
              <span className="text-2xl">🔄</span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhuma movimentação recorrente cadastrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ backgroundColor: "var(--bg-muted)" }} className="text-left">
                  {["Descrição", "Tipo", "Pagamento", "Frequência", "Início", "Duração", "Valor", ""].map(h => (
                    <th key={h} style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="group transition-colors"
                    style={{ borderTop: "1px solid var(--border)" }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 500, color: "var(--text-base)" }}>
                      {row.description}
                      {row.category && (
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)", backgroundColor: "var(--bg-muted)", padding: "0.125rem 0.375rem", borderRadius: "9999px" }}>
                          {row.category}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      {row.kind === "receita"
                        ? <span className="badge-green">↑ Receita</span>
                        : <span className="badge-red">↓ Despesa</span>
                      }
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      {row.payment_method && row.payment_method !== "a_vista" ? (
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "9999px", backgroundColor: row.payment_method === "credito" ? "rgba(37,99,235,0.12)" : "rgba(107,114,128,0.12)", color: row.payment_method === "credito" ? "#2563eb" : "var(--text-muted)" }}>
                          {row.payment_method === "credito" ? "Crédito" : "Débito"}
                          {row.payment_method === "credito" && row.installments > 1 ? ` ${row.installments}×` : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>À vista</span>
                      )}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                      {freqLabel[row.frequency] ?? row.frequency}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {formatDate(row.date)}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {endDescription(row)}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 700, whiteSpace: "nowrap", color: row.kind === "receita" ? "#10b981" : "#f43f5e" }}>
                      {formatBRL(row.amount)}
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditing(row)} title="Editar"
                          style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <IconEdit />
                        </button>
                        <button onClick={() => handleDelete(row.id)} title="Excluir"
                          style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
