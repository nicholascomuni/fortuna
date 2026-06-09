import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import TransactionForm from "../components/TransactionForm";
import { IconCheck } from "../components/Icons";

export default function NewTransaction() {
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);

  async function handleSubmit(payload) {
    setLoading(true);
    try {
      await api.createTransaction(payload);
      setSuccess(true);
      setTimeout(() => navigate("/"), 1200);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Nova movimentação</h1>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">Adicione uma receita ou despesa</p>
      </div>

      {success && (
        <div style={{ marginBottom: "1rem", backgroundColor: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.3)", color: "#059669", borderRadius: "0.75rem", padding: "1rem", fontSize: "0.875rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <IconCheck className="w-4 h-4" /> Movimentação salva! Redirecionando…
        </div>
      )}

      <div className="card p-6">
        <TransactionForm onSubmit={handleSubmit} onCancel={() => navigate("/")}
          loading={loading} categories={categories} />
      </div>
    </div>
  );
}
