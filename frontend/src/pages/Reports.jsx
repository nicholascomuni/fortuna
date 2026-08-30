import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, Legend, CartesianGrid,
} from "recharts";
import { api } from "../api/client";
import { formatBRL, formatDate } from "../utils/format";
import {
  IconTrendingUp, IconTrendingDown, IconWallet,
  IconTarget, IconPiggyBank, IconCreditCard, IconBarChart,
  IconAlertTriangle,
} from "../components/Icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

function thisYear() {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

const COLORS_EXPENSE = [
  "#f43f5e", "#fb7185", "#fda4af", "#fecdd3",
  "#f97316", "#fdba74", "#fbbf24", "#fde68a",
];
const COLORS_INCOME = [
  "#10b981", "#34d399", "#6ee7b7", "#a7f3d0",
  "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe",
];

function pct(value, max) {
  return max > 0 ? Math.min(100, (value / max) * 100) : 0;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function healthColor(rate) {
  if (rate >= 20) return "#10b981";
  if (rate >= 10) return "#f59e0b";
  return "#f43f5e";
}

function healthLabel(rate) {
  if (rate >= 20) return "Ótima";
  if (rate >= 10) return "Razoável";
  if (rate >= 0)  return "Atenção";
  return "Crítica";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = "#2563eb", loading }) {
  return (
    <div className="card p-4" style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{
          width: "2rem", height: "2rem", borderRadius: "0.625rem", flexShrink: 0,
          backgroundColor: color + "1a",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>{label}</span>
      </div>
      {loading ? (
        <div style={{ height: "1.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
      ) : (
        <>
          <p style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-base)", lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{sub}</p>}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)",
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem",
    }}>
      {children}
    </h2>
  );
}

function CategoryBar({ label, value, pctVal, color, total }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-base)", fontWeight: 500 }}>{label}</span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{pctVal}%</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>{formatBRL(value)}</span>
        </div>
      </div>
      <div style={{ height: "6px", borderRadius: "9999px", backgroundColor: "var(--bg-muted)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: "9999px",
          width: `${pctVal}%`,
          backgroundColor: color,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

function HealthGauge({ rate }) {
  const color = healthColor(rate);
  const label = healthLabel(rate);
  const clampedPct = Math.max(0, Math.min(100, rate));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ position: "relative", width: "120px", height: "64px" }}>
        <svg viewBox="0 0 120 64" width="120" height="64">
          {/* Track */}
          <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--bg-muted)" strokeWidth="12" strokeLinecap="round" />
          {/* Fill */}
          <path
            d="M10 60 A50 50 0 0 1 110 60"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${clampedPct * 1.571} 157.1`}
            style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s" }}
          />
        </svg>
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", fontWeight: 800, color, lineHeight: 1 }}>{rate.toFixed(1)}%</p>
        </div>
      </div>
      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color }}>{label}</span>
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Taxa de poupança</span>
    </div>
  );
}

// Custom tooltip for the monthly bar chart
function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: "0.625rem 0.875rem", fontSize: "0.8125rem", minWidth: "160px" }}>
      <p style={{ fontWeight: 600, color: "var(--text-base)", marginBottom: "0.375rem" }}>{monthLabel(label)}</p>
      {payload.map(p => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: p.color }}>
          <span>{p.name === "receita" ? "Receitas" : p.name === "despesa" ? "Despesas" : "Saldo"}</span>
          <span style={{ fontWeight: 600 }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Reports() {
  const defaults = thisYear();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate]     = useState(defaults.end);
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [catTab, setCatTab]       = useState("despesa"); // "despesa" | "receita"

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReports({ start: startDate, end: endDate });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const kpis = data?.kpis ?? {};
  const monthly = data?.monthly ?? [];
  const byExpense = data?.by_category_expense ?? [];
  const byIncome  = data?.by_category_income  ?? [];
  const topExp    = data?.top_expenses ?? [];
  const topInc    = data?.top_incomes  ?? [];
  const methods   = data?.payment_methods ?? [];

  const maxCatExpense = byExpense[0]?.total ?? 1;
  const maxCatIncome  = byIncome[0]?.total  ?? 1;
  const monthlyMax    = Math.max(...monthly.map(m => Math.max(m.receita, m.despesa)), 1);

  const isEmpty = !loading && (!data || monthly.length === 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Relatório Financeiro</h1>
          <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
            Análise detalhada das suas finanças pessoais
          </p>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); load(); }}
          style={{ display: "flex", alignItems: "flex-end", gap: "0.625rem", flexWrap: "wrap" }}
        >
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>De</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>Até</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
          </div>
          <button type="submit" className="btn-primary text-xs" style={{ height: "2.25rem" }}>
            Atualizar
          </button>
        </form>
      </div>

      {error && (
        <div style={{ padding: "0.875rem 1rem", borderRadius: "0.875rem", backgroundColor: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", color: "#f43f5e", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="card py-20 text-center">
          <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "1rem", backgroundColor: "var(--bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
            <IconBarChart className="w-7 h-7" style={{ color: "var(--text-muted)" }} />
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9375rem", fontWeight: 500 }}>Nenhum lançamento no período selecionado.</p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.375rem" }}>Ajuste as datas ou cadastre movimentações no Dashboard.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={IconTrendingUp}
              label="Renda média mensal"
              value={formatBRL(kpis.avg_monthly_income)}
              sub={`Total: ${formatBRL(kpis.total_income)}`}
              color="#10b981"
              loading={loading}
            />
            <KpiCard
              icon={IconTrendingDown}
              label="Custo médio mensal"
              value={formatBRL(kpis.avg_monthly_expense)}
              sub={`Total: ${formatBRL(kpis.total_expense)}`}
              color="#f43f5e"
              loading={loading}
            />
            <KpiCard
              icon={IconPiggyBank}
              label="Economia média mensal"
              value={formatBRL(kpis.avg_monthly_savings)}
              sub={`Taxa: ${kpis.savings_rate?.toFixed(1)}% da renda`}
              color="#3b82f6"
              loading={loading}
            />
            <KpiCard
              icon={IconWallet}
              label="Saldo líquido do período"
              value={formatBRL(kpis.net)}
              sub={`Em ${kpis.num_months} mês${kpis.num_months !== 1 ? "es" : ""}`}
              color={kpis.net >= 0 ? "#10b981" : "#f43f5e"}
              loading={loading}
            />
          </div>

          {/* ── Saúde + Runway + Payment methods ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Saúde financeira */}
            <div className="card p-5" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <SectionTitle>Saúde financeira</SectionTitle>
              {loading ? (
                <div style={{ width: "120px", height: "80px", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
              ) : (
                <HealthGauge rate={kpis.savings_rate ?? 0} />
              )}
              <div style={{ marginTop: "1rem", width: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[
                  { label: "≥ 20%", desc: "Ótima — patrimônio crescendo", dot: "#10b981" },
                  { label: "10–20%", desc: "Razoável — pode melhorar", dot: "#f59e0b" },
                  { label: "0–10%", desc: "Atenção — reservas pequenas", dot: "#f43f5e" },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: r.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}><strong style={{ color: "var(--text-secondary)" }}>{r.label}</strong> — {r.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Runway */}
            <div className="card p-5">
              <SectionTitle>Reserva de emergência</SectionTitle>
              {loading ? (
                <div style={{ height: "5rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <p style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-base)", lineHeight: 1 }}>
                      {kpis.months_runway > 0 ? `${kpis.months_runway.toFixed(1)}×` : "—"}
                    </p>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      meses de custo de vida cobertos pela economia atual
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {[
                      { label: "≥ 6 meses", desc: "Reserva sólida", ok: (kpis.months_runway ?? 0) >= 6 },
                      { label: "3–6 meses", desc: "Reserva básica", ok: (kpis.months_runway ?? 0) >= 3 && (kpis.months_runway ?? 0) < 6 },
                      { label: "< 3 meses", desc: "Atenção — fortalecer reserva", ok: false },
                    ].map(r => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.75rem" }}>{r.ok ? "✅" : "⬜"}</span>
                        <span style={{ fontSize: "0.7rem", color: r.ok ? "var(--text-base)" : "var(--text-muted)" }}>
                          <strong>{r.label}</strong> — {r.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Formas de pagamento */}
            <div className="card p-5">
              <SectionTitle>Formas de pagamento</SectionTitle>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} style={{ height: "2rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
                  ))}
                </div>
              ) : methods.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Nenhuma despesa no período.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {methods.map((m, i) => {
                    const label = m.method === "credito" ? "Crédito" : m.method === "debito" ? "Débito" : "À vista";
                    const color = m.method === "credito" ? "#a855f7" : m.method === "debito" ? "#3b82f6" : "#10b981";
                    return (
                      <CategoryBar key={m.method} label={label} value={m.total} pctVal={m.pct} color={color} />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Monthly evolution chart ── */}
          <div className="card p-5">
            <SectionTitle>Evolução mensal — Receitas vs Despesas</SectionTitle>
            {loading ? (
              <div style={{ height: "220px", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
            ) : monthly.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Sem dados mensais.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} barCategoryGap="30%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    axisLine={false} tickLine={false} width={55}
                  />
                  <Tooltip content={<MonthlyTooltip />} cursor={{ fill: "var(--bg-muted)", opacity: 0.5 }} />
                  <Legend
                    formatter={v => v === "receita" ? "Receitas" : "Despesas"}
                    wrapperStyle={{ fontSize: "0.75rem", color: "var(--text-secondary)", paddingTop: "0.5rem" }}
                  />
                  <Bar dataKey="receita" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="despesa" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── By category ── */}
          <div className="card p-5">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <SectionTitle>Gastos por categoria</SectionTitle>
              <div style={{ display: "flex", borderRadius: "0.625rem", overflow: "hidden", border: "1px solid var(--border)" }}>
                {[["despesa", "Despesas"], ["receita", "Receitas"]].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCatTab(key)}
                    style={{
                      padding: "0.3rem 0.875rem",
                      fontSize: "0.75rem", fontWeight: 500, cursor: "pointer", border: "none",
                      backgroundColor: catTab === key ? "#2563eb" : "transparent",
                      color: catTab === key ? "#fff" : "var(--text-muted)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{ height: "2.25rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
                ))}
              </div>
            ) : (catTab === "despesa" ? byExpense : byIncome).length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhum dado para o período.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {(catTab === "despesa" ? byExpense : byIncome).map((cat, i) => (
                  <CategoryBar
                    key={cat.category}
                    label={cat.category}
                    value={cat.total}
                    pctVal={cat.pct}
                    color={catTab === "despesa" ? COLORS_EXPENSE[i % COLORS_EXPENSE.length] : COLORS_INCOME[i % COLORS_INCOME.length]}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Top transactions ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top despesas */}
            <div className="card p-5">
              <SectionTitle>Top 5 maiores despesas</SectionTitle>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ height: "2.5rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
                  ))}
                </div>
              ) : topExp.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhuma despesa no período.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {topExp.map((t, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0.625rem 0.75rem", borderRadius: "0.75rem",
                      backgroundColor: "var(--bg-muted)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", overflow: "hidden" }}>
                        <span style={{
                          width: "1.5rem", height: "1.5rem", borderRadius: "50%",
                          backgroundColor: "rgba(244,63,94,0.12)", color: "#f43f5e",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
                        }}>{i + 1}</span>
                        <div style={{ overflow: "hidden" }}>
                          <p style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-base)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</p>
                          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatDate(t.date)}{t.category ? ` · ${t.category}` : ""}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#f43f5e", whiteSpace: "nowrap", marginLeft: "0.5rem" }}>
                        {formatBRL(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top receitas */}
            <div className="card p-5">
              <SectionTitle>Top 5 maiores receitas</SectionTitle>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ height: "2.5rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.5rem" }} className="animate-pulse" />
                  ))}
                </div>
              ) : topInc.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Nenhuma receita no período.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {topInc.map((t, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0.625rem 0.75rem", borderRadius: "0.75rem",
                      backgroundColor: "var(--bg-muted)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", overflow: "hidden" }}>
                        <span style={{
                          width: "1.5rem", height: "1.5rem", borderRadius: "50%",
                          backgroundColor: "rgba(16,185,129,0.12)", color: "#10b981",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.7rem", fontWeight: 700, flexShrink: 0,
                        }}>{i + 1}</span>
                        <div style={{ overflow: "hidden" }}>
                          <p style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-base)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</p>
                          <p style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{formatDate(t.date)}{t.category ? ` · ${t.category}` : ""}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap", marginLeft: "0.5rem" }}>
                        {formatBRL(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Monthly cashflow table ── */}
          <div className="card overflow-hidden">
            <div style={{ padding: "1.25rem 1.5rem 0.75rem" }}>
              <SectionTitle>Fluxo de caixa mensal</SectionTitle>
            </div>
            {loading ? (
              <div className="p-5 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{ height: "2.5rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "var(--bg-muted)" }}>
                      {["Mês", "Receitas", "Despesas", "Saldo", "Var."].map(h => (
                        <th key={h} style={{ padding: "0.625rem 1.25rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: h === "Mês" ? "left" : "right" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((m, i) => {
                      const prev = monthly[i - 1];
                      const varPct = prev && prev.saldo !== 0
                        ? ((m.saldo - prev.saldo) / Math.abs(prev.saldo)) * 100
                        : null;
                      return (
                        <tr key={m.month} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 1.25rem", fontWeight: 500, color: "var(--text-base)" }}>
                            {monthLabel(m.month)}
                          </td>
                          <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#10b981", fontWeight: 600 }}>
                            {formatBRL(m.receita)}
                          </td>
                          <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", color: "#f43f5e", fontWeight: 600 }}>
                            {formatBRL(m.despesa)}
                          </td>
                          <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 700, color: m.saldo >= 0 ? "#10b981" : "#f43f5e" }}>
                            {formatBRL(m.saldo)}
                          </td>
                          <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontSize: "0.75rem", color: varPct == null ? "var(--text-muted)" : varPct >= 0 ? "#10b981" : "#f43f5e" }}>
                            {varPct == null ? "—" : `${varPct >= 0 ? "+" : ""}${varPct.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--border)", backgroundColor: "var(--bg-muted)" }}>
                      <td style={{ padding: "0.75rem 1.25rem", fontWeight: 700, color: "var(--text-base)", fontSize: "0.8125rem" }}>Total</td>
                      <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{formatBRL(kpis.total_income)}</td>
                      <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 700, color: "#f43f5e" }}>{formatBRL(kpis.total_expense)}</td>
                      <td style={{ padding: "0.75rem 1.25rem", textAlign: "right", fontWeight: 700, color: kpis.net >= 0 ? "#10b981" : "#f43f5e" }}>{formatBRL(kpis.net)}</td>
                      <td style={{ padding: "0.75rem 1.25rem" }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
