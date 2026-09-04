import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import ChatThread from "./ChatThread";
import { IconSparkles, IconX, IconMaximize } from "./Icons";

export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [resolving, setResolving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (conversationId) return;
    setResolving(true);
    try {
      const rows = await api.getAiConversations();
      if (rows.length > 0) {
        setConversationId(rows[0].id);
      } else {
        const c = await api.createAiConversation();
        setConversationId(c.id);
      }
    } finally {
      setResolving(false);
    }
  }

  function handleConversationChanged(patch) {
    if (patch && !conversationId) setConversationId(patch.id);
  }

  return (
    <div ref={ref}>
      {open && (
        <div
          className="card"
          style={{
            position: "fixed", right: "1.25rem", bottom: "5.5rem", zIndex: 40,
            width: "min(24rem, calc(100vw - 2.5rem))", height: "min(32rem, calc(100vh - 8rem))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 25px 50px -12px rgb(0 0 0 / .5)", padding: 0,
          }}
        >
          <div style={{ padding: "0.75rem 0.875rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IconSparkles className="w-4 h-4" style={{ color: "#6366f1", flexShrink: 0 }} />
            <p style={{ color: "var(--text-base)", fontSize: "0.8125rem", fontWeight: 600, flex: 1 }}>Assistente</p>
            <Link to="/assistente" onClick={() => setOpen(false)} className="btn-ghost p-1.5 rounded-lg" title="Abrir tela cheia">
              <IconMaximize className="w-3.5 h-3.5" />
            </Link>
            <button onClick={() => setOpen(false)} className="btn-ghost p-1.5 rounded-lg" title="Fechar">
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>

          {resolving || !conversationId ? (
            <div style={{ flex: 1 }} />
          ) : (
            <ChatThread conversationId={conversationId} onConversationChanged={handleConversationChanged} compact autoFocus={false} />
          )}
        </div>
      )}

      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        style={{
          position: "fixed", right: "1.25rem", bottom: "1.25rem", zIndex: 25,
          width: "3.25rem", height: "3.25rem", borderRadius: "9999px",
          background: "linear-gradient(135deg, #6366f1 0%, #2563eb 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 12px 24px -8px rgba(99,102,241,0.55)",
          border: "none", cursor: "pointer", color: "#fff",
        }}
        title="Assistente de IA"
      >
        {open ? <IconX className="w-5 h-5" /> : <IconSparkles className="w-5 h-5" />}
      </button>
    </div>
  );
}
