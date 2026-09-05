import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { api } from "../api/client";
import { formatBRL, formatDate } from "../utils/format";
import { IconSparkles, IconSend, IconCheck, IconX, IconTrendingUp, IconTrendingDown, IconCreditCard, IconBank, IconChevronDown } from "./Icons";

let _tempId = -1;
function tempId() { return _tempId--; }

const SUGGESTIONS = [
  "Quanto gastei este mês?",
  "Qual categoria eu mais gasto?",
  "Adicione uma despesa de R$ 50 em Mercado hoje",
  "Como está minha projeção de saldo pros próximos 3 meses?",
];

const MD_COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// Only the assistant's persisted text goes through markdown — the user's own
// typed text and the live "..."/cursor placeholders are passed as plain
// strings/JSX and render as-is.
function Bubble({ role, children, compact }) {
  const isUser = role === "user";
  const isMarkdown = !isUser && typeof children === "string";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        className={isMarkdown ? "md-content" : undefined}
        style={{
          maxWidth: compact ? "88%" : "min(34rem, 88%)",
          padding: compact ? "0.5rem 0.75rem" : "0.625rem 0.875rem",
          borderRadius: isUser ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
          backgroundColor: isUser ? "#2563eb" : "var(--bg-muted)",
          color: isUser ? "#fff" : "var(--text-base)",
          fontSize: compact ? "0.8125rem" : "0.875rem",
          lineHeight: 1.5,
          whiteSpace: isMarkdown ? "normal" : "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {isMarkdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MD_COMPONENTS}>
            {children}
          </ReactMarkdown>
        ) : children}
      </div>
    </div>
  );
}

// Describes how to render+navigate for each kind of resource a write tool
// can produce. There's no per-resource detail route in this app (rows are
// viewed/edited from within their list page's own modals), so clicking just
// jumps to that list page — simple and consistent with how a human would
// find the same row themselves.
const RESOURCE_META = {
  transaction: {
    path: "/",
    icon: r => (r.kind === "receita" ? IconTrendingUp : IconTrendingDown),
    color: r => (r.kind === "receita" ? "#10b981" : "#f43f5e"),
    bg: r => (r.kind === "receita" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)"),
    title: r => r.description,
    subtitle: r => `${formatBRL(r.amount)} · ${formatDate(r.date)}`,
  },
  credit_purchase: {
    path: "/cartoes",
    icon: () => IconCreditCard,
    color: () => "#ea580c",
    bg: () => "rgba(234,88,12,0.12)",
    title: r => r.description,
    subtitle: r => `${formatBRL(r.total_amount)} · compra no cartão`,
  },
  card: {
    path: "/cartoes",
    icon: () => IconCreditCard,
    color: () => "#6366f1",
    bg: () => "rgba(99,102,241,0.12)",
    title: r => r.name,
    subtitle: r => `Cartão · vencimento dia ${r.due_day}`,
  },
  account: {
    path: "/contas",
    icon: () => IconBank,
    color: () => "#0ea5e9",
    bg: () => "rgba(14,165,233,0.12)",
    title: r => r.name,
    subtitle: r => `Conta bancária · saldo inicial ${formatBRL(r.initial_balance)}`,
  },
};

// Minimal, clickable summary card for a resource the assistant just
// created/edited — clicking jumps to the page where it actually lives.
function ResourceWidget({ result, compact }) {
  const navigate = useNavigate();
  const meta = RESOURCE_META[result?.resource_type];
  if (!meta) return null;
  const Icon = meta.icon(result);
  return (
    <button
      onClick={() => navigate(meta.path)}
      className="flex items-center gap-2 text-left"
      style={{
        width: "100%",
        maxWidth: compact ? "16rem" : "20rem",
        padding: "0.5rem 0.625rem",
        borderRadius: "0.625rem",
        border: "1px solid var(--border)",
        backgroundColor: "var(--bg-card)",
        cursor: "pointer",
      }}
    >
      <span style={{ width: "1.75rem", height: "1.75rem", borderRadius: "0.5rem", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: meta.bg(result), color: meta.color(result), flexShrink: 0 }}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta.title(result)}
        </span>
        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta.subtitle(result)}
        </span>
      </span>
      <span style={{ color: "var(--text-muted)", flexShrink: 0, display: "inline-flex", transform: "rotate(-90deg)" }}>
        <IconChevronDown className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}

function PendingActions({ message, busy, onConfirm, onCancel, compact }) {
  const actions = message.pending_actions;
  if (!actions || actions.length === 0) return null;

  const allPending = actions.every(a => a.status === "pending");
  if (allPending) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "-0.5rem", marginLeft: "0.25rem" }}>
          <button
            onClick={() => onConfirm(message.id)}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm"
            style={{ padding: "0.4rem 0.875rem", borderRadius: "0.625rem", fontWeight: 600, cursor: busy ? "default" : "pointer", border: "1px solid rgba(5,150,105,0.35)", backgroundColor: "rgba(5,150,105,0.1)", color: "#059669" }}
          >
            <IconCheck className="w-3.5 h-3.5" /> Confirmar
          </button>
          <button
            onClick={() => onCancel(message.id)}
            disabled={busy}
            className="flex items-center gap-1.5 text-sm"
            style={{ padding: "0.4rem 0.875rem", borderRadius: "0.625rem", fontWeight: 600, cursor: busy ? "default" : "pointer", border: "1px solid var(--border)", backgroundColor: "transparent", color: "var(--text-secondary)" }}
          >
            <IconX className="w-3.5 h-3.5" /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  // Already resolved (confirmed/cancelled/failed) — a clickable widget for
  // each resource that got created/edited, plus a small status tag.
  const status = actions.some(a => a.status === "failed") ? "failed"
    : actions.every(a => a.status === "cancelled") ? "cancelled"
    : "confirmed";
  const label = { confirmed: "✓ Confirmado", cancelled: "Cancelado", failed: "⚠ Erro em parte das ações" }[status];
  const color = { confirmed: "#059669", cancelled: "var(--text-muted)", failed: "#e11d48" }[status];
  const widgets = actions.filter(a => a.status === "confirmed" && a.result);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.375rem", marginTop: "-0.25rem", marginLeft: "0.25rem" }}>
      {widgets.map(a => <ResourceWidget key={a.id} result={a.result} compact={compact} />)}
      <span style={{ fontSize: "0.72rem", fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

/**
 * Reusable chat thread — message list + input + pending-action confirmation —
 * shared by the full /assistente page (with its conversation sidebar) and
 * the floating chat bubble widget (a single compact thread).
 */
export default function ChatThread({ conversationId, onConversationChanged, compact = false, autoFocus = true }) {
  const [messages, setMessages] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState(null);
  const [busyMessageId, setBusyMessageId] = useState(null);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    setMessages(null);
    api.getAiConversationMessages(conversationId)
      .then(setMessages)
      .catch(e => { setError(e.message); setMessages([]); });
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, streamingText]);

  // Auto-grow the textarea with its content, capped so it doesn't take over the thread.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  async function handleSend(e, forcedText) {
    e?.preventDefault();
    const text = (forcedText ?? input).trim();
    if (!text || sending || !conversationId) return;
    setError("");
    setInput("");
    const optimistic = { id: tempId(), role: "user", content: text, pending_actions: null, created_at: new Date().toISOString() };
    setMessages(m => [...(m ?? []), optimistic]);
    setSending(true);
    setStreamingText("");
    try {
      await api.streamAiMessage(conversationId, text, {
        onDelta: chunk => setStreamingText(t => (t ?? "") + chunk),
        onMessage: msg => {
          if (msg.role === "user") {
            setMessages(m => m.map(x => (x.id === optimistic.id ? msg : x)));
          } else {
            setMessages(m => [...m, msg]);
            setStreamingText(null);
          }
        },
        onDone: conversation => onConversationChanged?.(conversation),
      });
    } catch (err) {
      setMessages(m => m.filter(x => x.id !== optimistic.id));
      setError(err.message);
      setInput(text);
    } finally {
      setSending(false);
      setStreamingText(null);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleConfirm(messageId) {
    setBusyMessageId(messageId);
    try {
      const [updated, summary] = await api.confirmAiAction(messageId);
      setMessages(m => [...m.map(x => (x.id === messageId ? updated : x)), summary]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyMessageId(null);
    }
  }

  async function handleCancel(messageId) {
    setBusyMessageId(messageId);
    try {
      const [updated, cancelMsg] = await api.cancelAiAction(messageId);
      setMessages(m => [...m.map(x => (x.id === messageId ? updated : x)), cancelMsg]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyMessageId(null);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: compact ? "0.75rem" : "1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {messages === null ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: "2.5rem", width: "60%", backgroundColor: "var(--bg-muted)", borderRadius: "1rem" }} className="animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.875rem", padding: compact ? "1rem 0.5rem" : "2rem 1rem", textAlign: "center" }}>
            <div style={{ width: compact ? "2.5rem" : "3rem", height: compact ? "2.5rem" : "3rem", borderRadius: "9999px", backgroundColor: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IconSparkles className={compact ? "w-5 h-5" : "w-6 h-6"} style={{ color: "#6366f1" }} />
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: compact ? "0.8125rem" : "0.875rem", maxWidth: compact ? "18rem" : "24rem" }}>
              Pergunte qualquer coisa sobre suas finanças, ou peça para eu adicionar, editar ou excluir uma movimentação — eu sempre confirmo com você antes de alterar qualquer dado.
            </p>
            <div className="flex flex-wrap gap-2 justify-center" style={{ maxWidth: compact ? "20rem" : "28rem" }}>
              {(compact ? SUGGESTIONS.slice(0, 2) : SUGGESTIONS).map(s => (
                <button
                  key={s}
                  onClick={(e) => handleSend(e, s)}
                  className="text-xs"
                  style={{ padding: "0.5rem 0.75rem", borderRadius: "0.75rem", border: "1px solid var(--border)", color: "var(--text-secondary)", background: "transparent", cursor: "pointer" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className="space-y-1.5">
              <Bubble role={m.role} compact={compact}>{m.content}</Bubble>
              <PendingActions message={m} busy={busyMessageId === m.id} onConfirm={handleConfirm} onCancel={handleCancel} compact={compact} />
            </div>
          ))
        )}
        {sending && (
          <Bubble role="assistant" compact={compact}>
            {streamingText ? (
              <>{streamingText}<span className="animate-pulse">▍</span></>
            ) : (
              <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: "0.15s" }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: "0.3s" }}>●</span>
              </span>
            )}
          </Bubble>
        )}
      </div>

      {error && (
        <div style={{ padding: "0.5rem 1rem", fontSize: "0.8125rem", color: "#e11d48", borderTop: "1px solid var(--border)" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSend} style={{ borderTop: "1px solid var(--border)", padding: compact ? "0.625rem" : "0.75rem", display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte algo ou peça um lançamento… (Shift+Enter para nova linha)"
          className="input"
          rows={1}
          disabled={sending}
          autoFocus={autoFocus}
          style={{ resize: "none", overflowY: "auto", maxHeight: "10rem", lineHeight: 1.4 }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="btn-primary flex items-center justify-center"
          style={{ width: "2.5rem", height: "2.5rem", flexShrink: 0, opacity: sending || !input.trim() ? 0.5 : 1 }}
          title="Enviar"
        >
          <IconSend className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
