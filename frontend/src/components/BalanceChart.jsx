import { useState, useRef, useEffect } from "react";
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
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
    </div>
  );
}

function isDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

// Deepest zoom level — a week of daily points is still meaningful, going
// narrower just shows 1-2 dots with nothing to read.
const MIN_VIEW_POINTS = 7;
const ZOOM_STEP = 0.72;

// Small round icon button for the zoom/reset controls overlaid on the chart.
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

export default function BalanceChart({ data, loading, fill = false }) {
  const dark = isDark();
  const containerRef = useRef(null);
  const dragRef = useRef(null); // { startX, startViewStart } while a drag is in progress
  const [dragging, setDragging] = useState(false);

  const total = data?.length ?? 0;
  const [view, setView] = useState({ start: 0, length: total });

  // The visible window is local UI state layered on top of whatever range
  // was fetched — reset it whenever the underlying series changes (new
  // date filter, reload) so a stale window can't point past its end.
  useEffect(() => {
    setView({ start: 0, length: data?.length ?? 0 });
  }, [data]);

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
    const rect = containerRef.current?.getBoundingClientRect();
    const ratio = rect ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5;
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, ratio);
  }

  function panByPixels(dxPixels, startView) {
    const width = containerRef.current?.clientWidth || 1;
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

  const isZoomed = view.length < total;
  const boxHeight = fill ? "100%" : "16rem";

  if (loading) return (
    <div style={{ height: boxHeight, backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
  );

  if (!data?.length) return (
    <div style={{ height: boxHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
      Nenhum dado para exibir.
    </div>
  );

  const start = Math.round(view.start);
  const windowSlice = data.slice(start, start + Math.round(view.length));
  const sampled = downsample(windowSlice);
  const hasNeg = sampled.some(d => d.balance < 0);

  const gridColor  = dark ? "#1f2937" : "#f3f4f6";
  const axisColor  = dark ? "#6b7280" : "#9ca3af";
  const strokePos  = dark ? "#60a5fa" : "#3b82f6";

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={e => handleDragStart(e.clientX)}
      onMouseMove={e => handleDragMove(e.clientX)}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchStart={e => handleDragStart(e.touches[0].clientX)}
      onTouchMove={e => handleDragMove(e.touches[0].clientX)}
      onTouchEnd={handleDragEnd}
      onDoubleClick={() => setView({ start: 0, length: total })}
      title="Arraste para navegar · role para dar zoom"
      style={{
        position: "relative",
        height: fill ? "100%" : 280,
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "pan-y",
        userSelect: "none",
      }}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
