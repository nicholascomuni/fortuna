import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import ChatThread from "../components/ChatThread";
import { IconSparkles, IconPlus, IconTrash, IconMenu, IconX } from "../components/Icons";

function relativeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias atrás`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ConversationRow({ conversation, active, onSelect, onDelete }) {
  return (
    <div
      onClick={onSelect}
      className="group"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
        padding: "0.625rem 0.75rem", borderRadius: "0.75rem", cursor: "pointer",
        backgroundColor: active ? "rgba(37,99,235,0.1)" : "transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = "var(--bg-muted)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          color: active ? "#2563eb" : "var(--text-base)", fontSize: "0.8125rem", fontWeight: active ? 600 : 500,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {conversation.title || "Nova conversa"}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: "0.1rem" }}>
          {relativeLabel(conversation.updated_at)}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(conversation); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ padding: "0.3rem", borderRadius: "0.4rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
        title="Excluir conversa"
      >
        <IconTrash className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AiChat() {
  const [conversations, setConversations] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { confirm, confirmEl } = useConfirm();

  const loadConversations = useCallback(async (selectId) => {
    const rows = await api.getAiConversations();
    setConversations(rows);
    if (selectId !== undefined) {
      setActiveId(selectId);
    } else if (rows.length > 0) {
      setActiveId(prev => (prev && rows.some(r => r.id === prev) ? prev : rows[0].id));
    } else {
      setActiveId(null);
    }
    return rows;
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  async function handleNewConversation() {
    const c = await api.createAiConversation();
    setConversations(rows => [c, ...(rows ?? [])]);
    setActiveId(c.id);
    setSidebarOpen(false);
  }

  async function handleDeleteConversation(conversation) {
    const ok = await confirm({
      title: "Excluir conversa",
      message: `Excluir "${conversation.title || "Nova conversa"}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    await api.deleteAiConversation(conversation.id);
    const rows = (conversations ?? []).filter(c => c.id !== conversation.id);
    setConversations(rows);
    if (activeId === conversation.id) {
      setActiveId(rows.length > 0 ? rows[0].id : null);
    }
  }

  function handleConversationChanged(patch) {
    if (!patch) return;
    setConversations(rows =>
      (rows ?? []).some(c => c.id === patch.id)
        ? [...rows]
            .map(c => (c.id === patch.id ? patch : c))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        : [patch, ...(rows ?? [])]
    );
  }

  async function ensureActiveConversation() {
    if (activeId) return activeId;
    const c = await api.createAiConversation();
    setConversations(rows => [c, ...(rows ?? [])]);
    setActiveId(c.id);
    return c.id;
  }

  const activeConversation = (conversations ?? []).find(c => c.id === activeId) ?? null;

  return (
    <div style={{ height: "calc(100vh - 8.5rem)", display: "flex", gap: "1rem" }}>
      {confirmEl}

      {/* Sidebar — desktop: static column; mobile: overlay drawer */}
      <div
        className="hidden md:flex"
        style={{ width: "16rem", flexShrink: 0, flexDirection: "column" }}
      >
        <SidebarContent
          conversations={conversations}
          activeId={activeId}
          onSelect={id => setActiveId(id)}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden"
          style={{ position: "fixed", inset: 0, zIndex: 45, backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "17rem", borderRadius: 0, display: "flex", flexDirection: "column", padding: "0.75rem" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "var(--text-base)", fontSize: "0.8125rem", fontWeight: 600 }}>Conversas</span>
              <button onClick={() => setSidebarOpen(false)} className="btn-ghost p-1.5 rounded-lg"><IconX className="w-4 h-4" /></button>
            </div>
            <SidebarContent
              conversations={conversations}
              activeId={activeId}
              onSelect={id => { setActiveId(id); setSidebarOpen(false); }}
              onNew={handleNewConversation}
              onDelete={handleDeleteConversation}
            />
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost p-1.5 rounded-lg md:hidden" style={{ flexShrink: 0 }}>
            <IconMenu className="w-4 h-4" />
          </button>
          <IconSparkles className="w-4 h-4" style={{ color: "#6366f1", flexShrink: 0 }} />
          <p style={{ color: "var(--text-base)", fontSize: "0.875rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {activeConversation?.title || "Assistente"}
          </p>
        </div>

        {conversations === null ? (
          <div style={{ flex: 1 }} />
        ) : (
          <ChatThreadWithLazyConversation
            activeId={activeId}
            ensureActiveConversation={ensureActiveConversation}
            onConversationChanged={handleConversationChanged}
          />
        )}
      </div>
    </div>
  );
}

// Wraps ChatThread so the very first message (when there's no conversation
// yet) transparently creates one first, instead of requiring an empty state
// screen with its own separate "start" step.
function ChatThreadWithLazyConversation({ activeId, ensureActiveConversation, onConversationChanged }) {
  const [resolvedId, setResolvedId] = useState(activeId);

  useEffect(() => { setResolvedId(activeId); }, [activeId]);

  if (!resolvedId) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <button
          onClick={async () => setResolvedId(await ensureActiveConversation())}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <IconPlus className="w-4 h-4" /> Nova conversa
        </button>
      </div>
    );
  }

  return <ChatThread conversationId={resolvedId} onConversationChanged={onConversationChanged} />;
}

function SidebarContent({ conversations, activeId, onSelect, onNew, onDelete }) {
  return (
    <>
      <button
        onClick={onNew}
        className="btn-primary text-sm flex items-center justify-center gap-2 mb-3"
        style={{ flexShrink: 0 }}
      >
        <IconPlus className="w-4 h-4" /> Nova conversa
      </button>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
        {conversations === null ? (
          [...Array(4)].map((_, i) => (
            <div key={i} style={{ height: "2.75rem", backgroundColor: "var(--bg-muted)", borderRadius: "0.75rem" }} className="animate-pulse" />
          ))
        ) : conversations.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", padding: "0.5rem" }}>
            Nenhuma conversa ainda.
          </p>
        ) : (
          conversations.map(c => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              onSelect={() => onSelect(c.id)}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </>
  );
}
