"use client";

import { useState } from "react";
import { Check, MessageSquare, X } from "lucide-react";
import { trpc } from "@/trpc/react";

function when(d: Date) {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Panel lateral derecho con el hilo de comentarios de una página. */
export function CommentsPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: comments } = trpc.comments.list.useQuery({ pageId });
  const [body, setBody] = useState("");
  const canEdit = me?.wsRole !== "viewer";
  const canDelete = (authorId: string) =>
    canEdit && (authorId === me?.id || me?.role === "admin" || me?.wsRole === "owner");

  const refresh = () => utils.comments.list.invalidate({ pageId });
  const add = trpc.comments.add.useMutation({
    onSuccess: () => {
      setBody("");
      refresh();
    },
  });
  const toggle = trpc.comments.toggleResolve.useMutation({ onSuccess: refresh });
  const remove = trpc.comments.remove.useMutation({ onSuccess: refresh });

  const send = () => {
    const text = body.trim();
    if (text && !add.isPending) add.mutate({ pageId, body: text });
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-xl md:static md:z-auto md:shadow-none">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold">
          <MessageSquare size={16} /> Comentarios
        </h2>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {(comments ?? []).length === 0 && (
          <p className="text-sm text-[var(--muted)]">Todavía no hay comentarios.</p>
        )}
        {(comments ?? []).map((c) => (
          <div key={c.id} className={`group rounded-lg text-sm ${c.resolved ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand">
                {(c.author.name || c.author.email)[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 truncate font-medium">{c.author.name || c.author.email}</span>
              <span className="shrink-0 text-[10px] text-[var(--muted)]">{when(c.createdAt)}</span>
              {canEdit && (
                <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => toggle.mutate({ id: c.id })}
                    className="rounded px-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    title={c.resolved ? "Reabrir" : "Marcar como resuelto"}
                  >
                    <Check size={14} />
                  </button>
                  {canDelete(c.author.id) && (
                    <button
                      onClick={() => remove.mutate({ id: c.id })}
                      className="rounded px-1 text-xs text-[var(--muted)] hover:text-red-500"
                      title="Borrar comentario"
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              )}
            </div>
            <p className={`mt-1 whitespace-pre-wrap pl-7 ${c.resolved ? "line-through" : ""}`}>{c.body}</p>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="border-t border-[var(--border)] p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Escribe un comentario…"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={send}
            disabled={!body.trim() || add.isPending}
            className="mt-1 w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      )}
    </aside>
  );
}

/** Botón "Comentarios (N)" para la cabecera de la página. */
export function CommentsButton({ pageId, onClick }: { pageId: string; onClick: () => void }) {
  const { data: comments } = trpc.comments.list.useQuery({ pageId });
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"
      title="Comentarios"
    >
      <MessageSquare size={16} /> {comments?.length ?? 0}
    </button>
  );
}
