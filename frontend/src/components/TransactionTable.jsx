import { formatBRL, formatDate } from "../utils/format";
import { IconEdit, IconTrash, IconAlertTriangle } from "./Icons";

const freqLabel = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" };

const paymentLabel = { a_vista: "À vista", debito: "Débito", credito: "Crédito" };
function PaymentBadge({ method, installments }) {
  const label = paymentLabel[method] ?? method;
  const isCredit = method === "credito";
  return (
    <span style={{
      fontSize: "0.7rem", fontWeight: 600, padding: "0.1rem 0.4rem",
      borderRadius: "9999px",
      backgroundColor: isCredit ? "rgba(37,99,235,0.12)" : "rgba(107,114,128,0.12)",
      color: isCredit ? "#2563eb" : "var(--text-muted)",
    }}>
      {label}{isCredit && installments > 1 ? ` ${installments}×` : ""}
    </span>
  );
}

export default function TransactionTable({ rows, loading, onEdit, onDelete }) {
  if (loading) return (
    <div className="space-y-2 p-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
      ))}
    </div>
  );

  if (!rows?.length) return (
    <div className="py-16 text-center">
      <div style={{ width: "3rem", height: "3rem", backgroundColor: "var(--bg-muted)", borderRadius: "1rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
        <span className="text-2xl">📭</span>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhuma movimentação encontrada.</p>
    </div>
  );

  const showBalance = rows[0]?.balance !== undefined;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="text-left">
            {["Data", "Descrição", "Tipo", "Categoria", "Valor", ...(showBalance ? ["Saldo"] : []), ...(onEdit || onDelete ? [""] : [])].map(h => (
              <th key={h} style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.625rem 0.75rem" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const negBal = showBalance && row.balance < 0;
            return (
              <tr
                key={row.id ?? `${row.transaction_id}-${row.date}-${i}`}
                className="group transition-colors"
                style={{ borderTop: "1px solid var(--border)", backgroundColor: negBal ? "rgba(225,29,72,0.05)" : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = negBal ? "rgba(225,29,72,0.05)" : "transparent"}
              >
                <td style={{ padding: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                  {formatDate(row.date)}
                </td>
                <td style={{ padding: "0.75rem", color: "var(--text-base)", fontWeight: 500 }}>
                  <span>{row.description}</span>
                  {row.type === "recorrente" && (
                    <span style={{ marginLeft: "0.375rem", fontSize: "0.75rem", color: "#60a5fa", fontWeight: 400 }}>
                      · {freqLabel[row.frequency] ?? row.frequency}
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.75rem" }}>
                  {row.kind === "receita"
                    ? <span className="badge-green">↑ Receita</span>
                    : <span className="badge-red">↓ Despesa</span>
                  }
                </td>
                <td style={{ padding: "0.75rem" }}>
                  {row.category
                    ? <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", backgroundColor: "var(--bg-muted)", padding: "0.125rem 0.5rem", borderRadius: "9999px" }}>{row.category}</span>
                    : <span style={{ color: "var(--text-muted)" }}>—</span>
                  }
                </td>
                <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: row.kind === "receita" ? "#10b981" : "#f43f5e" }}>
                  {row.kind === "receita" ? "+" : "−"}{formatBRL(row.amount)}
                </td>
                {showBalance && (
                  <td style={{ padding: "0.75rem", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", color: negBal ? "#f43f5e" : "var(--text-base)" }}>
                    <span className="flex items-center justify-end gap-1">
                      {negBal && <IconAlertTriangle className="w-3.5 h-3.5" style={{ color: "#f43f5e" }} />}
                      {formatBRL(row.balance)}
                    </span>
                  </td>
                )}
                {(onEdit || onDelete) && (
                  <td style={{ padding: "0.75rem", textAlign: "right" }}>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onEdit && (
                        <button onClick={() => onEdit(row)} title="Editar"
                          style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.backgroundColor = "rgba(37,99,235,0.1)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <IconEdit />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(row)} title="Excluir"
                          style={{ padding: "0.375rem", borderRadius: "0.5rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#e11d48"; e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.1)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
