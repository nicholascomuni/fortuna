import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { formatBRL } from "../utils/format";
import { IconPlus, IconEdit, IconTrash, IconX, IconWallet, IconBank } from "../components/Icons";

const emptyAccount = { name: "", bank: "", initial_balance: "" };

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", backdropFilter: "blur(4px)" }}>
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
    <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50, padding: "0.75rem 1rem", borderRadius: "0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#fff", backgroundColor: toast.type === "error" ? "#e11d48" : "#059669" }}>
      {toast.msg}
    </div>
  );
}

function AccountForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial ? {
    ...emptyAccount, ...initial,
    initial_balance: initial.initial_balance != null ? String(initial.initial_balance) : "",
  } : emptyAccount);
  const [errors, setErrors] = useState([]);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors([]);
    try {
      await onSubmit({
        name: form.name,
        bank: form.bank || null,
        initial_balance: form.initial_balance || 0,
      });
    } catch (err) { setErrors([err.message]); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.length > 0 && (
        <div style={{ backgroundColor: "rgba(225,29,72,0.1)", border: "1px solid rgba(225,29,72,0.3)", color: "#e11d48", borderRadius: "0.75rem", padding: "0.75rem", fontSize: "0.875rem" }}>
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div>
        <label className="label">Nome *</label>
        <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
          placeholder="Ex.: Conta corrente" required className="input" />
      </div>
      <div>
        <label className="label">Banco (opcional)</label>
        <input type="text" value={form.bank} onChange={e => set("bank", e.target.value)}
          placeholder="Ex.: Nubank" className="input" />
      </div>
      <div>
        <label className="label">Saldo inicial</label>
        <input type="number" step="0.01" value={form.initial_balance}
          onChange={e => set("initial_balance", e.target.value)} placeholder="0,00" className="input" />
      </div>
      <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)", marginTop: "0.25rem" }}>
        <button type="submit" disabled={loading} className="btn-primary flex-1" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? "Salvando…" : "Salvar conta"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-5" style={{ border: "1px solid var(--border)" }}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // null | {} (new) | account (edit)
  const [saveLoading, setSaveLoading] = useState(false);
  const { confirm, confirmEl } = useConfirm();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await api.getAccounts());
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(payload) {
    setSaveLoading(true);
    try {
      if (modal?.id) await api.updateAccount(modal.id, payload);
      else await api.createAccount(payload);
      showToast(modal?.id ? "Conta atualizada!" : "Conta adicionada!");
      setModal(null); load();
    } catch (err) { showToast(err.message, "error"); throw err; }
    finally { setSaveLoading(false); }
  }

  async function handleDelete(account) {
    const ok = await confirm({
      title: "Excluir conta",
      message: `Tem certeza que deseja excluir "${account.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    try { await api.deleteAccount(account.id); showToast("Conta excluída."); load(); }
    catch (err) { showToast(err.message, "error"); }
  }

  return (
    <div className="space-y-5">
      {confirmEl}
      <Toast toast={toast} />

      {modal && (
        <Modal title={modal.id ? "Editar conta" : "Adicionar conta"} onClose={() => setModal(null)}>
          <AccountForm initial={modal.id ? modal : null} onSubmit={handleSave}
            onCancel={() => setModal(null)} loading={saveLoading} />
        </Modal>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Contas</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
            Suas contas bancárias neste plano
          </p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary text-sm flex items-center gap-2">
          <IconPlus className="w-4 h-4" /> Adicionar conta
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: "7rem", borderRadius: "1.1rem", backgroundColor: "var(--bg-muted)" }} className="animate-pulse" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card py-16 text-center">
          <div style={{ width: "3rem", height: "3rem", borderRadius: "1rem", backgroundColor: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
            <IconWallet className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhuma conta cadastrada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account => (
            <div key={account.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem", backgroundColor: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconBank className="w-4 h-4" style={{ color: "#2563eb" }} />
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setModal(account)} title="Editar"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <IconEdit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(account)} title="Excluir"
                    style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div>
                <p style={{ color: "var(--text-base)", fontWeight: 600, fontSize: "0.9375rem" }}>{account.name}</p>
                {account.bank && <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{account.bank}</p>}
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                Saldo inicial: <strong style={{ color: "var(--text-base)" }}>{formatBRL(account.initial_balance)}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
