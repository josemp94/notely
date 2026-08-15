"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";

export const FIELD_LABELS: Record<string, string> = {
  text: "Texto",
  number: "Número",
  select: "Selección",
  checkbox: "Casilla",
  date: "Fecha",
};

const TYPES = ["text", "number", "select", "checkbox", "date"] as const;

export function AddFieldButton({
  collectionId,
  onDone,
}: {
  collectionId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const addField = trpc.db.addField.useMutation({
    onSuccess: () => {
      setOpen(false);
      onDone();
    },
  });

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded px-2 py-0.5 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
        title="Añadir columna"
      >
        +
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addField.mutate({ collectionId, name: FIELD_LABELS[t], type: t })}
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
            >
              {FIELD_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
