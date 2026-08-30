const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });

  // 401 → token inválido/expirado; recarrega para forçar logout
  if (res.status === 401 && path !== "/auth/login" && path !== "/auth/register") {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }

  const json = await res.json();
  if (!res.ok) {
    const msg =
      (json.errors && json.errors.join(" ")) ||
      json.error ||
      `Erro ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export const api = {
  // Auth
  register: (data) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => request("/auth/me"),

  // Settings
  getSettings: () => request("/settings"),
  updateSettings: (data) =>
    request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Transactions
  getTransactions: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/transactions${qs ? "?" + qs : ""}`);
  },
  createTransaction: (data) =>
    request("/transactions", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id, data) =>
    request(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransaction: (id) =>
    request(`/transactions/${id}`, { method: "DELETE" }),

  // Recurring
  getRecurring: () => request("/recurring"),

  // Projection
  getProjection: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/projection${qs ? "?" + qs : ""}`);
  },

  // Simulation
  simulate: (data) =>
    request("/projection/simulate", { method: "POST", body: JSON.stringify(data) }),

  // Categories
  getCategories: () => request("/categories"),

  // Profile
  updateProfile: (data) =>
    request("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),

  // Reports
  getReports: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports${qs ? "?" + qs : ""}`);
  },

  // Data export / import
  exportData: () => request("/data/export"),
  importData: (data) =>
    request("/data/import", { method: "POST", body: JSON.stringify(data) }),
};
