"use client";

import { trpc } from "@/trpc/react";

type Item = { id: string; title: string; icon: string | null; parentId: string | null; archivedAt: Date };

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

  // Construye el árbol dentro de la papelera: una entrada es "raíz" de la papelera
  // si no tiene padre o su padre NO está también en la papelera.
  const list = (items ?? []) as Item[];
  const inTrash = new Set(list.map((p) => p.id));
  const byParent = new Map<string | null, Item[]>();
  for (const p of list) {
    const key = p.parentId && inTrash.has(p.parentId) ? p.parentId : null;
    const arr = byParent.get(key) ?? [];
    arr.push(p);
    byParent.set(key, arr);
  }
  const roots = byParent.get(null) ?? [];

  const countDesc = (id: string): number => {
    const kids = byParent.get(id) ?? [];
    return kids.reduce((n, k) => n + 1 + countDesc(k.id), 0);
  };

  const renderChildren = (id: string, depth: number) =>
    (byParent.get(id) ?? []).map((c) => (
      <div key={c.id}>
        <div
          className="flex items-center gap-2 py-1 text-sm text-[var(--muted)]"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <span className="opacity-60">↳</span>
          <span className="truncate">
            {c.icon ? `${c.icon} ` : "📄 "}
            {c.title || "Sin título"}
          </span>
        </div>
        {renderChildren(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 md:px-12 md:py-16">
      <h1 className="font-display mb-2 text-4xl font-extrabold">Papelera</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Al restaurar o borrar un elemento, se aplica también a sus subpáginas (mostradas debajo con ↳).
      </p>
      {isLoading ? (
        <p className="text-[var(--muted)]">Cargando…</p>
      ) : roots.length === 0 ? (
        <p className="text-[var(--muted)]">La papelera está vacía.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {roots.map((p) => {
            const n = countDesc(p.id);
            return (
              <li key={p.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {p.icon ? `${p.icon} ` : "📄 "}
                    {p.title || "Sin título"}
                    {n > 0 && (
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        +{n} subpágina{n > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 gap-3 text-sm">
                    <button onClick={() => restore.mutate({ id: p.id })} className="text-brand hover:underline">
                      Restaurar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(n > 0 ? `¿Borrar definitivamente esta página y sus ${n} subpáginas?` : "¿Borrar definitivamente?"))
                          remove.mutate({ id: p.id });
                      }}
                      className="text-[var(--muted)] hover:text-red-500"
                    >
                      Borrar
                    </button>
                  </span>
                </div>
                {renderChildren(p.id, 1)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
