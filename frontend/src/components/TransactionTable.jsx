import { useState, useEffect, useRef } from "react";
import { formatBRL, formatDate } from "../utils/format";
import { IconEdit, IconTrash, IconAlertTriangle, IconChevronDown } from "./Icons";
import EntryDetailModal from "./EntryDetailModal";

const freqLabel = { semanal: "Semanal", mensal: "Mensal", anual: "Anual" };
const paymentLabel = { a_vista: "À vista", debito: "Débito", cartao_credito: "Cartão de crédito" };

function buildDetailFields(row, cardById) {
  const fields = [
    { label: "Valor", value: `${row.kind === "receita" ? "+" : "−"}${formatBRL(row.amount)}`, strong: true },
    { label: "Tipo", value: row.kind === "receita" ? "Receita" : "Despesa" },
    { label: "Data", value: formatDate(row.date) },
    { label: "Categoria", value: row.category },
  ];
  if (row.balance !== undefined) fields.push({ label: "Saldo acumulado", value: formatBRL(row.balance) });
  if (row.source === "credit_invoice") {
    fields.push({ label: "Cartão", value: cardById.get(row.source_card_id)?.name });
  } else if (row.source === "credit_purchase") {
    fields.push({ label: "Cartão", value: cardById.get(row.card_id)?.name });
    if (row.installments > 1) fields.push({ label: "Parcelas", value: `${row.installments}x` });
    if (row.type === "recorrente") fields.push({ label: "Recorrência", value: freqLabel[row.frequency] ?? row.frequency });
  } else {
    fields.push({ label: "Forma de pagamento", value: paymentLabel[row.payment_method] ?? row.payment_method });
    if (row.type === "recorrente") fields.push({ label: "Recorrência", value: freqLabel[row.frequency] ?? row.frequency });
    if (row.is_interest_child) fields.push({ label: "Origem", value: row.kind === "receita" ? "Rendimento de juros" : "Reajuste por juros" });
  }
  return fields;
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{
        width: "1rem", height: "1rem", cursor: "pointer",
        accentColor: "#2563eb", borderRadius: "0.25rem",
      }}
    />
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkBar({ count, onDelete, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      padding: "0.5rem 0.75rem", borderRadius: "0.75rem", marginBottom: "0.75rem",
      backgroundColor: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.2)",
    }}>
      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#2563eb" }}>
        {count} selecionado{count !== 1 ? "s" : ""}
      </span>

      <div ref={ref} style={{ position: "relative", marginLeft: "auto" }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            padding: "0.375rem 0.75rem", borderRadius: "0.625rem",
            fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-card)", color: "var(--text-base)",
          }}
        >
          Ações
          <IconChevronDown className="w-3.5 h-3.5" />
        </button>

        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 0.375rem)", zIndex: 30,
            backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "0.75rem", boxShadow: "0 10px 25px -5px rgb(0 0 0/.15)",
            minWidth: "10rem", overflow: "hidden",
          }}>
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.625rem 0.875rem", fontSize: "0.8125rem", fontWeight: 500,
                color: "#e11d48", background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(225,29,72,0.07)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <IconTrash className="w-3.5 h-3.5" />
              Excluir selecionados
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onClear}
        style={{
          fontSize: "0.75rem", color: "var(--text-muted)", background: "transparent",
          border: "none", cursor: "pointer", padding: "0.25rem",
        }}
      >
        Limpar seleção
      </button>
    </div>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function TransactionTable({ rows, loading, onEdit, onDelete, onBulkDelete, cards = [] }) {
  const [selected, setSelected] = useState(new Set());
  const [detailRow, setDetailRow] = useState(null);
  const cardById = new Map(cards.map(c => [c.id, c]));

  // Clear selection when rows change (filter, reload)
  useEffect(() => setSelected(new Set()), [rows]);

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
  const rowIds = rows.map(r => r.id ?? r.transaction_id).filter(Boolean);
  const allChecked = rowIds.length > 0 && rowIds.every(id => selected.has(id));
  const someChecked = rowIds.some(id => selected.has(id));

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rowIds));
  }

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    await onBulkDelete([...selected]);
    setSelected(new Set());
  }

  return (
    <div>
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onDelete={handleBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-left">
              <th style={{ padding: "0.625rem 0.75rem", width: "2.5rem" }}>
                <Checkbox
                  checked={allChecked}
                  indeterminate={!allChecked && someChecked}
                  onChange={toggleAll}
                />
              </th>
              {["Data", "Descrição", "Categoria", "Valor",
                ...(showBalance ? ["Saldo"] : []),
                ...(onEdit || onDelete ? [""] : []),
              ].map(h => (
                <th key={h} style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.625rem 0.75rem" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id = row.id ?? row.transaction_id;
              const isSelected = id != null && selected.has(id);
              const negBal = showBalance && row.balance < 0;
              const baseBg = isSelected
                ? "rgba(37,99,235,0.06)"
                : negBal ? "rgba(225,29,72,0.05)" : "transparent";
              // Transactions and credit purchases are separate DB tables with
              // independent auto-increment ids, so a bare numeric id can
              // collide across the two (e.g. transaction #7 and purchase #7
              // both landing in this same merged list) — key by row.source
              // (always set: "credit_invoice" | "credit_purchase" | null for
              // a plain transaction) plus whichever id field that row has.
              const rowKey = `${row.source || "transaction"}-${row.transaction_id ?? row.purchase_id ?? `${row.date}-${i}`}`;

              return (
                <tr
                  key={rowKey}
                  className="group transition-colors"
                  style={{ borderTop: "1px solid var(--border)", backgroundColor: baseBg, cursor: "pointer" }}
                  onClick={() => setDetailRow(row)}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = baseBg}
                >
                  <td style={{ padding: "0.75rem", width: "2.5rem" }} onClick={e => e.stopPropagation()}>
                    {id != null && (
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                      />
                    )}
                  </td>
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
                    {row.is_interest_child && (
                      <span style={{ marginLeft: "0.375rem", fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "9999px", backgroundColor: row.kind === "receita" ? "rgba(16,185,129,0.12)" : "rgba(225,29,72,0.12)", color: row.kind === "receita" ? "#10b981" : "#e11d48" }}>
                        {row.kind === "receita" ? "% rendimento" : "% reajuste"}
                      </span>
                    )}
                    {row.source === "credit_invoice" && (
                      <span style={{ marginLeft: "0.375rem", fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "9999px", backgroundColor: "rgba(99,102,241,0.12)", color: "#6366f1" }}>
                        Fatura{cardById.get(row.source_card_id) ? `: ${cardById.get(row.source_card_id).name}` : ""}
                      </span>
                    )}
                    {row.source === "credit_purchase" && (
                      <span style={{ marginLeft: "0.375rem", fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "9999px", backgroundColor: "rgba(234,88,12,0.12)", color: "#ea580c" }}>
                        Compra no cartão{cardById.get(row.card_id) ? `: ${cardById.get(row.card_id).name}` : ""}
                      </span>
                    )}
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
                    <td style={{ padding: "0.75rem", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      {row.source !== "credit_invoice" && (
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
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detailRow && (
        <EntryDetailModal
          title={detailRow.description}
          badge={
            detailRow.source === "credit_invoice"
              ? { label: `Fatura${cardById.get(detailRow.source_card_id) ? `: ${cardById.get(detailRow.source_card_id).name}` : ""}`, bg: "rgba(99,102,241,0.12)", color: "#6366f1" }
              : detailRow.source === "credit_purchase"
              ? { label: `Compra no cartão${cardById.get(detailRow.card_id) ? `: ${cardById.get(detailRow.card_id).name}` : ""}`, bg: "rgba(234,88,12,0.12)", color: "#ea580c" }
              : detailRow.is_interest_child
              ? (detailRow.kind === "receita"
                  ? { label: "% rendimento", bg: "rgba(16,185,129,0.12)", color: "#10b981" }
                  : { label: "% reajuste", bg: "rgba(225,29,72,0.12)", color: "#e11d48" })
              : null
          }
          fields={buildDetailFields(detailRow, cardById)}
          note={detailRow.source === "credit_invoice" ? "Esta fatura é gerada automaticamente a partir das compras no cartão. Edite as compras em Cartões." : null}
          onClose={() => setDetailRow(null)}
          onEdit={onEdit && detailRow.source !== "credit_invoice" ? () => { setDetailRow(null); onEdit(detailRow); } : null}
          onDelete={onDelete && detailRow.source !== "credit_invoice" ? () => { setDetailRow(null); onDelete(detailRow); } : null}
        />
      )}
    </div>
  );
}
