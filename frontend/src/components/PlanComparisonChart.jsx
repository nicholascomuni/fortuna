import { useState, useRef, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { formatBRL, formatDate } from "../utils/format";

// Keeps each row's original index (idx) intact — see BalanceChart.jsx's
// downsample for why: it's what the numeric x-axis plots against, so a
// downsampled series still lines up against the pan/zoom `view` state.
function downsample(data, maxPoints = 2000) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0 || i === data.length - 1);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const date = payload[0]?.payload?.date;
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
      <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.375rem" }}>{formatDate(date)}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ fontWeight: 700, fontSize: "0.875rem", color: p.color }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

const MIN_VIEW_POINTS = 7;
const ZOOM_STEP = 0.72;

function ChartButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      title={title}
      className="btn-ghost"
      style={{
        width: "1.75rem", height: "1.75rem", padding: 0, borderRadius: "0.5rem",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1,
        backgroundColor: "var(--bg-card)", border: "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}

// Overlays up to a few plans' balance series on one chart — same drag-to-pan
// / scroll-to-zoom interaction as BalanceChart (dashboard), but as separate
// Line series (not a filled Area, since overlapping fills would obscure
// each other) so multiple plans stay readable at once.
export default function PlanComparisonChart({ series = [], loading }) {
  const dark = isDark();
  // State, not a plain useRef — see BalanceChart.jsx for why: this component
  // returns an early loading/empty skeleton before the real chart div (with
  // the ref) ever mounts, so a [] wheel-effect keyed off a plain ref would
  // capture null and never run again once the real element appears.
  const [containerEl, setContainerEl] = useState(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const sbTrackRef = useRef(null);
  const sbDragRef = useRef(null);

  const total = series[0]?.data?.length ?? 0;
  const [view, setView] = useState({ start: 0, length: total });

  useEffect(() => {
    setView({ start: 0, length: total });
  }, [total]);

  // Computed once per `series` change — NOT re-merged/re-sliced on every
  // pan/zoom frame (see BalanceChart.jsx's plotData for the full rationale).
  // Each row keeps its original index as `idx`, which the numeric x-axis
  // plots against; pan/zoom then just moves the visible domain over this
  // fixed series instead of rebuilding a windowed array every frame.
  const plotData = useMemo(() => {
    const rows = [];
    for (let i = 0; i < total; i++) {
      const row = { idx: i, date: series[0]?.data[i]?.date };
      for (const s of series) row[`s_${s.id}`] = s.data[i]?.balance;
      rows.push(row);
    }
    return downsample(rows);
  }, [series, total]);

  function clampView(start, length) {
    const len = Math.max(Math.min(MIN_VIEW_POINTS, total), Math.min(length, total));
    const maxStart = Math.max(0, total - len);
    return { start: Math.max(0, Math.min(start, maxStart)), length: len };
  }

  function zoomBy(factor, anchorRatio = 0.5) {
    setView(v => {
      const anchorIndex = v.start + v.length * anchorRatio;
      const newLength = v.length * factor;
      const newStart = anchorIndex - newLength * anchorRatio;
      return clampView(newStart, newLength);
    });
  }

  function handleWheel(e) {
    if (total <= MIN_VIEW_POINTS) return;
    e.preventDefault();
    const rect = containerEl?.getBoundingClientRect();
    const ratio = rect ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ratio);
  }

  // See BalanceChart.jsx for why this needs a real native, non-passive
  // listener rather than a plain onWheel prop, and why it depends on
  // containerEl rather than running once with [].
  const handleWheelRef = useRef(handleWheel);
  handleWheelRef.current = handleWheel;
  useEffect(() => {
    if (!containerEl) return;
    const listener = e => handleWheelRef.current(e);
    containerEl.addEventListener("wheel", listener, { passive: false });
    return () => containerEl.removeEventListener("wheel", listener);
  }, [containerEl]);

  function panByPixels(dxPixels, startView) {
    const width = containerEl?.clientWidth || 1;
    const pointsPerPixel = startView.length / width;
    setView(clampView(startView.start - dxPixels * pointsPerPixel, startView.length));
  }

  function handleDragStart(clientX) {
    dragRef.current = { startX: clientX, startView: view };
    setDragging(true);
  }
  function handleDragMove(clientX) {
    if (!dragRef.current) return;
    panByPixels(clientX - dragRef.current.startX, dragRef.current.startView);
  }
  function handleDragEnd() {
    dragRef.current = null;
    setDragging(false);
  }

  function handleSbDragStart(clientX) {
    sbDragRef.current = { startX: clientX, startView: view };
    setDragging(true);
  }
  function handleSbDragMove(clientX) {
    if (!sbDragRef.current) return;
    const trackWidth = sbTrackRef.current?.clientWidth || 1;
    const pointsPerPixel = total / trackWidth;
    const dx = clientX - sbDragRef.current.startX;
    setView(clampView(sbDragRef.current.startView.start + dx * pointsPerPixel, sbDragRef.current.startView.length));
  }
  function handleSbDragEnd() {
    sbDragRef.current = null;
    setDragging(false);
  }

  const isZoomed = view.length < total;

  if (loading) return (
    <div style={{ height: 320, backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
  );

  if (!series.length) return (
    <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
      Selecione ao menos um plano de contas para ver o gráfico.
    </div>
  );

  // Y-axis auto-fits to the visible window (not the whole series) across
  // every plotted line, same rationale as BalanceChart.jsx.
  const viewStartIdx = Math.max(0, Math.round(view.start));
  const viewEndIdx = Math.min(total, Math.round(view.start + view.length));
  const visibleValues = [];
  for (let i = viewStartIdx; i < viewEndIdx; i++) {
    for (const s of series) {
      const v = s.data[i]?.balance;
      if (v != null) visibleValues.push(v);
    }
  }
  const yMin = visibleValues.length ? Math.min(...visibleValues) : 0;
  const yMax = visibleValues.length ? Math.max(...visibleValues) : 0;
  const yPad = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 10;

  const gridColor = dark ? "#1f2937" : "#f3f4f6";
  const axisColor = dark ? "#6b7280" : "#9ca3af";

  const sbThumbLeftPct  = total > 0 ? (view.start / total) * 100 : 0;
  const sbThumbWidthPct = total > 0 ? Math.max((view.length / total) * 100, 4) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        ref={setContainerEl}
        className={`${isZoomed ? "chart-drag-area" : ""}${dragging ? " dragging" : ""}`}
        onMouseDown={e => handleDragStart(e.clientX)}
        onMouseMove={e => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={e => handleDragStart(e.touches[0].clientX)}
        onTouchMove={e => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        onDoubleClick={() => setView({ start: 0, length: total })}
        title={isZoomed ? "Arraste para navegar · role para dar zoom" : "Role para dar zoom"}
        style={{ position: "relative", height: 320, touchAction: "pan-y", userSelect: "none" }}
      >
        <div style={{ position: "absolute", top: "0.25rem", right: "0.25rem", zIndex: 5, display: "flex", gap: "0.25rem" }}>
          {isZoomed && (
            <ChartButton onClick={() => setView({ start: 0, length: total })} title="Ver período completo">
              <span style={{ fontSize: "0.65rem" }}>100%</span>
            </ChartButton>
          )}
          <ChartButton onClick={() => zoomBy(ZOOM_STEP)} title="Aumentar zoom">+</ChartButton>
          <ChartButton onClick={() => zoomBy(1 / ZOOM_STEP)} title="Diminuir zoom">−</ChartButton>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="idx"
              type="number"
              domain={[view.start, view.start + view.length]}
              allowDataOverflow
              tickFormatter={idx => formatDate(series[0]?.data[Math.round(idx)]?.date)}
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              domain={[yMin - yPad, yMax + yPad]}
              allowDataOverflow
              tickFormatter={v => formatBRL(v)}
              tick={{ fontSize: 11, fill: axisColor }}
              tickLine={false} axisLine={false}
              width={96}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: axisColor, strokeWidth: 1, strokeDasharray: "4 4" }} />
            <ReferenceLine y={0} stroke={axisColor} strokeDasharray="5 3" strokeWidth={1} />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} iconType="line" />
            {series.map(s => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={`s_${s.id}`}
                name={s.name}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Discreet horizontal-only scrollbar mirroring the zoomed window */}
      <div
        ref={sbTrackRef}
        onMouseDown={e => { e.stopPropagation(); handleSbDragStart(e.clientX); }}
        onMouseMove={e => handleSbDragMove(e.clientX)}
        onMouseUp={handleSbDragEnd}
        onMouseLeave={handleSbDragEnd}
        onTouchStart={e => { e.stopPropagation(); handleSbDragStart(e.touches[0].clientX); }}
        onTouchMove={e => handleSbDragMove(e.touches[0].clientX)}
        onTouchEnd={handleSbDragEnd}
        style={{ position: "relative", height: "0.875rem", flexShrink: 0, cursor: "pointer", marginTop: "0.125rem" }}
      >
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "3px", transform: "translateY(-50%)", backgroundColor: "var(--border)", borderRadius: "9999px" }} />
        <div style={{
          position: "absolute", top: "50%", height: "3px", transform: "translateY(-50%)",
          left: `${sbThumbLeftPct}%`, width: `${sbThumbWidthPct}%`,
          backgroundColor: "var(--text-muted)", borderRadius: "9999px",
          cursor: dragging ? "grabbing" : "grab",
        }} />
      </div>
    </div>
  );
}
