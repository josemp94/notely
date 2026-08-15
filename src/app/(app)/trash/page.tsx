"use client";

import { trpc } from "@/trpc/react";

export default function TrashPage() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.pages.trash.useQuery();
  const restore = trpc.pages.restore.useMutation({
    onSuccess: async () => {
      await utils.pages.trash.invalidate();
      await utils.pages.tree.invalidate();
    },
  });
  const remove = trpc.pages.remove.useMutation({
    onSuccess: async () => {
      await utils.pages.trash.invalidate();
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-12 py-16">
      <h1 className="font-display mb-6 text-4xl font-extrabold">Papelera</h1>
      {isLoading ? (
        <p className="text-[var(--muted)]">Cargando…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-[var(--muted)]">La papelera está vacía.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <span className="truncate">
                {p.icon ? `${p.icon} ` : "📄 "}
                {p.title || "Sin título"}
              </span>
              <span className="flex shrink-0 gap-3 text-sm">
                <button
                  onClick={() => restore.mutate({ id: p.id })}
                  className="text-brand hover:underline"
                >
                  Restaurar
                </button>
                <button
                  onClick={() => {
                    if (confirm("¿Borrar definitivamente?")) remove.mutate({ id: p.id });
                  }}
                  className="text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Borrar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
