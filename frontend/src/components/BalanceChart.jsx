import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from "recharts";
import { formatBRL, formatDate } from "../utils/format";

function downsample(data, maxPoints = 200) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const balance = payload.find(p => p.dataKey === "balance");
  const credit  = payload.find(p => p.dataKey === "credit_bill");
  return (
    <div style={{
      backgroundColor: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "0.75rem",
      padding: "0.75rem 1rem",
      fontSize: "0.875rem",
      boxShadow: "0 10px 15px -3px rgb(0 0 0 / .1)",
      minWidth: "10rem",
    }}>
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.375rem" }}>{formatDate(label)}</p>
      {balance && (
        <p style={{ fontWeight: 700, fontSize: "1rem", color: balance.value < 0 ? "#f43f5e" : "#2563eb" }}>
          {formatBRL(balance.value)}
        </p>
      )}
      {credit && credit.value != null && (
        <p style={{ fontWeight: 600, fontSize: "0.875rem", color: "#a855f7", marginTop: "0.25rem" }}>
          Fatura: {formatBRL(credit.value)}
        </p>
      )}
    </div>
  );
}

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export default function BalanceChart({ data, loading, showCredit = false }) {
  const dark = isDark();

  const gridColor  = dark ? "#1f2937" : "#f3f4f6";
  const axisColor  = dark ? "#6b7280" : "#9ca3af";
  const strokePos  = dark ? "#60a5fa" : "#3b82f6";
  const creditColor = dark ? "#c084fc" : "#a855f7";

  if (loading) return (
    <div style={{ height: "16rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
  );

  if (!data?.length) return (
    <div style={{ height: "16rem", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
      Nenhum dado para exibir.
    </div>
  );

  const sampled  = downsample(data);
  const hasNeg   = sampled.some(d => d.balance < 0);
  const hasCredit = showCredit && sampled.some(d => d.credit_bill != null);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={sampled} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={strokePos} stopOpacity={dark ? 0.25 : 0.18} />
            <stop offset="100%" stopColor={strokePos} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: axisColor }}
          tickLine={false} axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => formatBRL(v)}
          tick={{ fontSize: 11, fill: axisColor }}
          tickLine={false} axisLine={false}
          width={96}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: axisColor, strokeWidth: 1, strokeDasharray: "4 4" }} />
        {hasNeg && <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="5 3" strokeWidth={1.5} />}

        {/* Saldo projetado */}
        <Area
          type="monotone"
          dataKey="balance"
          name="Saldo"
          stroke={strokePos}
          strokeWidth={2.5}
          fill="url(#balGrad)"
          dot={false}
          activeDot={{ r: 4, fill: strokePos, strokeWidth: 0 }}
        />

        {/* Fatura de crédito mensal */}
        {showCredit && (
          <Line
            type="monotone"
            dataKey="credit_bill"
            name="Fatura crédito"
            stroke={creditColor}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 4, fill: creditColor, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: creditColor, strokeWidth: 0 }}
            connectNulls={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
