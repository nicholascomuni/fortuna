import { useState, useRef, useEffect } from "react";
import { IconChevronDown, IconX, IconCheck } from "./Icons";

const DEFAULT_CATEGORIES = [
  "Alimentação", "Moradia", "Transporte", "Saúde", "Lazer",
  "Educação", "Vestuário", "Salário", "Investimentos", "Outros",
];

export default function CategoryInput({ value, onChange, extraCategories = [] }) {
  const [inputValue, setInputValue] = useState(value || "");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...extraCategories])]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtered = inputValue.trim()
    ? allCategories.filter(c => c.toLowerCase().includes(inputValue.toLowerCase()))
    : allCategories;

  useEffect(() => { setInputValue(value || ""); }, [value]);

  function select(cat) { setInputValue(cat); onChange(cat); setOpen(false); }
  function handleInput(e) { setInputValue(e.target.value); onChange(e.target.value); setOpen(true); }
  function handleClear(e) { e.stopPropagation(); setInputValue(""); onChange(""); setOpen(false); }

  useEffect(() => {
    function outside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const isCustom = inputValue.trim() &&
    !allCategories.some(c => c.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          placeholder="Selecione ou crie nova…"
          className="input pr-8"
        />
        <button type="button" tabIndex={-1}
          onClick={inputValue ? handleClear : () => setOpen(o => !o)}
          style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          {inputValue
            ? <IconX className="w-3.5 h-3.5" />
            : <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          }
        </button>
      </div>

      {open && (
        <ul style={{ position: "absolute", zIndex: 20, marginTop: "0.375rem", width: "100%", backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "0.75rem", boxShadow: "0 10px 15px -3px rgb(0 0 0 / .1)", overflow: "hidden", maxHeight: "13rem", overflowY: "auto" }}>
          <li onMouseDown={() => select("")}
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
            <span>Sem categoria</span>
            {!inputValue && !value && <IconCheck className="w-3.5 h-3.5 text-blue-500" />}
          </li>

          {isCustom && (
            <li onMouseDown={() => select(inputValue.trim())}
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem", color: "#2563eb", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", borderTop: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
              <span style={{ fontSize: "0.75rem", backgroundColor: "rgba(37,99,235,0.1)", color: "#2563eb", padding: "0.125rem 0.375rem", borderRadius: "0.375rem", fontWeight: 600 }}>novo</span>
              {inputValue.trim()}
            </li>
          )}

          {filtered.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {filtered.map(cat => (
                <li key={cat} onMouseDown={() => select(cat)}
                  style={{ padding: "0.5rem 0.75rem", fontSize: "0.875rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: cat === value ? "#2563eb" : "var(--text-base)", fontWeight: cat === value ? 500 : 400 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-muted)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                  <span>{cat}</span>
                  {cat === value && <IconCheck className="w-3.5 h-3.5 text-blue-500" />}
                </li>
              ))}
            </div>
          )}

          {filtered.length === 0 && !isCustom && (
            <li style={{ padding: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)", textAlign: "center" }}>
              Nenhuma categoria encontrada.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
