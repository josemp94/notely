"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import type { FieldLite } from "./Cell";

/** Editor de un campo de relación: chips de registros vinculados + selector multi. */
export function RelationCell({
  field,
  value,
  onCommit,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
}) {
  const targetCollectionId = (field.config as { targetCollectionId?: string })?.targetCollectionId;
  const [open, setOpen] = useState(false);
  const { data: options } = trpc.db.relationOptions.useQuery(
    { collectionId: targetCollectionId ?? "" },
    { enabled: !!targetCollectionId },
  );

  const ids = Array.isArray(value) ? (value.filter((x) => typeof x === "string") as string[]) : [];
  const titleOf = (id: string) => options?.find((o) => o.id === id)?.title ?? "…";

  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onCommit(next.length ? next : null);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[24px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {ids.length === 0 ? (
          <span className="text-[var(--muted)]">+ vincular</span>
        ) : (
          ids.map((id) => (
            <span key={id} className="rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
              {titleOf(id)}
            </span>
          ))
        )}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg">
          {(options ?? []).length === 0 && (
            <div className="px-2 py-1 text-xs text-[var(--muted)]">La BD destino no tiene registros.</div>
          )}
          {(options ?? []).map((o) => (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-brand/10"
            >
              <span className="w-4 text-brand">{ids.includes(o.id) ? "✓" : ""}</span>
              <span className="truncate">{o.title}</span>
            </button>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-brand"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
