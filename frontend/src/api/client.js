const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Paths where a 401 means "these specific credentials/code were rejected",
// not "your session expired" — must not trigger the auto-logout redirect.
const NO_AUTO_LOGOUT_PATHS = ["/auth/login", "/auth/register", "/auth/login/2fa", "/auth/verify-email"];

async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });

  // 401 → token inválido/expirado; recarrega para forçar logout
  if (res.status === 401 && !NO_AUTO_LOGOUT_PATHS.includes(path)) {
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

// Streams the AI assistant's reply as Server-Sent Events over a plain
// fetch (EventSource can't send an Authorization header or a POST body).
// Each SSE frame is `data: <json>\n\n`; dispatches to onDelta/onMessage as
// they arrive and resolves once the server sends its closing 'done' frame.
async function streamAiMessage(conversationId, content, { onDelta, onMessage, onDone } = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/ai/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }
  if (!res.ok || !res.body) {
    let msg = `Erro ${res.status}`;
    try {
      const json = await res.json();
      msg = (json.errors && json.errors.join(" ")) || json.error || msg;
    } catch { /* body wasn't JSON (or already consumed) — keep default msg */ }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop(); // last chunk may be incomplete — keep it for next read
    for (const frame of frames) {
      const line = frame.split("\n").find(l => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.type === "delta") onDelta?.(evt.content);
      else if (evt.type === "message") onMessage?.(evt.message);
      else if (evt.type === "done") onDone?.(evt.conversation);
    }
  }
}

// For the one call that must authenticate with a token that ISN'T the
// stored session token — the short-lived 2FA pre_token from /auth/login.
async function requestWithToken(path, token, options = {}) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  const json = await res.json();
  if (!res.ok) {
    const msg = (json.errors && json.errors.join(" ")) || json.error || `Erro ${res.status}`;
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
  login2fa: (preToken, code) =>
    requestWithToken("/auth/login/2fa", preToken, { method: "POST", body: JSON.stringify({ code }) }),
  me: () => request("/auth/me"),

  // Email verification
  verifyEmail: (token) =>
    request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () =>
    request("/auth/resend-verification", { method: "POST" }),

  // Two-factor authentication
  setup2fa: () => request("/auth/2fa/setup", { method: "POST" }),
  enable2fa: (code) =>
    request("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
  disable2fa: (password) =>
    request("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ password }) }),

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
  parcelarFatura: (id, data) =>
    request(`/transactions/${id}/parcelar-fatura`, { method: "POST", body: JSON.stringify(data) }),

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

  // Credit cards
  getCards: () => request("/cards"),
  createCard: (data) =>
    request("/cards", { method: "POST", body: JSON.stringify(data) }),
  updateCard: (id, data) =>
    request(`/cards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCard: (id) =>
    request(`/cards/${id}`, { method: "DELETE" }),

  // Credit purchases
  getCreditPurchases: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/credit-purchases${qs ? "?" + qs : ""}`);
  },
  createCreditPurchase: (data) =>
    request("/credit-purchases", { method: "POST", body: JSON.stringify(data) }),
  updateCreditPurchase: (id, data) =>
    request(`/credit-purchases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCreditPurchase: (id) =>
    request(`/credit-purchases/${id}`, { method: "DELETE" }),

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

  // Plans ("planos de contas")
  getPlans: () => request("/plans"),
  createPlan: (data) =>
    request("/plans", { method: "POST", body: JSON.stringify(data) }),
  updatePlan: (id, data) =>
    request(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  activatePlan: (id) =>
    request(`/plans/${id}/activate`, { method: "POST" }),

  // Accounts
  getAccounts: () => request("/accounts"),
  createAccount: (data) =>
    request("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id, data) =>
    request(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAccount: (id) =>
    request(`/accounts/${id}`, { method: "DELETE" }),

  // AI assistant — conversations
  getAiConversations: () => request("/ai/conversations"),
  createAiConversation: () => request("/ai/conversations", { method: "POST" }),
  deleteAiConversation: (id) => request(`/ai/conversations/${id}`, { method: "DELETE" }),
  getAiConversationMessages: (id) => request(`/ai/conversations/${id}/messages`),
  sendAiMessage: (conversationId, content) =>
    request(`/ai/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  streamAiMessage,
  confirmAiAction: (messageId) =>
    request(`/ai/messages/${messageId}/confirm`, { method: "POST" }),
  cancelAiAction: (messageId) =>
    request(`/ai/messages/${messageId}/cancel`, { method: "POST" }),
};
