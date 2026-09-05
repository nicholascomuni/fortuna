export function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value ?? 0);
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Convert dd/mm/yyyy or yyyy-mm-dd → yyyy-mm-dd for <input type="date">
export function toInputDate(dateStr) {
  if (!dateStr) return "";
  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/");
    return `${y}-${m}-${d}`;
  }
  return dateStr;
}

export function today() {
  return new Date().toISOString().split("T")[0];
}

export function addMonths(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split("T")[0];
}

// "Hoje 14:32" / "Ontem" / "3 dias atrás" / "05/09" — used by the AI
// assistant's conversation list (full-page sidebar and the app nav's own).
export function relativeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias atrás`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
