"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/react";

/** Evento global para abrir la paleta desde cualquier botón (p. ej. el sidebar). */
export const OPEN_SEARCH_EVENT = "notely:open-search";

export function openSearchPalette() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/** Paleta de comandos estilo Notion: Ctrl/Cmd+K, búsqueda por título. */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // Al abrir: limpiar y enfocar el input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebounced("");
    setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounce ~150ms antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = trpc.pages.search.useQuery(
    { query: debounced },
    { enabled: open && debounced.trim().length > 0 },
  );
  const items = debounced.trim() ? results ?? [] : [];
  const selIdx = Math.min(sel, Math.max(items.length - 1, 0));

  if (!open) return null;

  const go = (id: string) => {
    setOpen(false);
    router.push(`/p/${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && items[selIdx]) {
              go(items[selIdx].id);
            }
          }}
          placeholder="Buscar páginas por título…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)]"
        />
        <div className="max-h-80 overflow-y-auto p-1">
          {items.map((p, i) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              onMouseEnter={() => setSel(i)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                i === selIdx ? "bg-brand-50 text-brand" : ""
              }`}
            >
              <span className="shrink-0">
                {p.icon ?? (p.type === "database" ? "🗃️" : "📄")}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.title || "Sin título"}</span>
              <span className="shrink-0 text-[11px] text-[var(--muted)]">
                {p.type === "database" ? "Base de datos" : "Página"}
              </span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              {debounced.trim() ? "Sin resultados" : "Escribe para buscar en el espacio…"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
