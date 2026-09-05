import { useState, useEffect } from "react";
import { api } from "../api/client";
import { today, addMonths } from "../utils/format";
import PlanComparisonChart from "../components/PlanComparisonChart";
import { IconCheck } from "../components/Icons";

const MAX_PLANS = 3;
const COLORS = ["#3b82f6", "#f59e0b", "#10b981"];

export default function Simulator() {
  const [plans, setPlans] = useState(null);
  const [selected, setSelected] = useState([]);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(addMonths(today(), 12));
  const [seriesData, setSeriesData] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getPlans(), api.getSharedPlans()]).then(([owned, shared]) => {
      const list = [...owned, ...shared.map(p => ({ ...p, sharedBy: p.owner_name }))];
      setPlans(list);
      const active = list.find(p => p.is_active);
      if (active) setSelected([active.id]);
    });
  }, []);

  useEffect(() => {
    if (selected.length === 0) { setSeriesData({}); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all(selected.map(id => api.getPlanProjection(id, { start: startDate, end: endDate })))
      .then(results => {
        if (cancelled) return;
        const map = {};
        selected.forEach((id, i) => { map[id] = results[i].chart; });
        setSeriesData(map);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, startDate, endDate]);

  function toggle(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_PLANS) return prev;
      return [...prev, id];
    });
  }

  const series = selected
    .map((id, i) => ({
      id,
      name: plans?.find(p => p.id === id)?.name ?? `Plano ${id}`,
      color: COLORS[i],
      data: seriesData[id] ?? [],
    }))
    .filter(s => s.data.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold">Simulador</h1>
        <p style={{ color: "var(--text-secondary)" }} className="text-sm mt-0.5">
          Compare a projeção de saldo de até {MAX_PLANS} planos de contas, sobrepostos no mesmo período
        </p>
      </div>

      <div className="card p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">De</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
        </div>
        <div>
          <label style={{ color: "var(--text-secondary)" }} className="text-xs font-medium mb-1 block">Até</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input text-sm" style={{ width: "9rem" }} />
        </div>

        <div className="flex flex-wrap gap-2">
          {plans === null ? (
            <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Carregando planos…</span>
          ) : (
            plans.map(plan => {
              const isSelected = selected.includes(plan.id);
              const color = isSelected ? COLORS[selected.indexOf(plan.id)] : null;
              const disabled = !isSelected && selected.length >= MAX_PLANS;
              return (
                <button
                  key={plan.id}
                  onClick={() => toggle(plan.id)}
                  disabled={disabled}
                  className="flex items-center gap-1.5 text-sm"
                  style={{
                    padding: "0.4rem 0.75rem", borderRadius: "0.625rem", fontWeight: 600,
                    border: `1px solid ${isSelected ? color : "var(--border)"}`,
                    backgroundColor: isSelected ? `${color}1a` : "transparent",
                    color: isSelected ? color : "var(--text-secondary)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                  }}
                  title={disabled ? `Você já selecionou ${MAX_PLANS} planos` : plan.sharedBy ? `Compartilhado por ${plan.sharedBy}` : undefined}
                >
                  {isSelected && <IconCheck className="w-3.5 h-3.5" />}
                  {plan.name}
                  {plan.sharedBy && <span style={{ opacity: 0.7, fontWeight: 400 }}>· {plan.sharedBy}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="card p-5">
        <PlanComparisonChart series={series} loading={loading} />
      </div>
    </div>
  );
}
