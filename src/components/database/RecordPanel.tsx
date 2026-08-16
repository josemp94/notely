"use client";

import { trpc } from "@/trpc/react";
import { Cell, type FieldLite } from "./Cell";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

export function RecordPanel({
  pageId,
  record,
  fields,
  onClose,
}: {
  pageId: string;
  record: Rec;
  fields: FieldLite[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const title =
    (titleField && typeof record.cells?.[titleField.id] === "string"
      ? (record.cells[titleField.id] as string)
      : "") || "Sin título";

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/20"
      onClick={onClose}
    >
      <div
        className="h-dvh w-full max-w-lg overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand" title="Cerrar">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.id} className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="truncate text-sm text-[var(--muted)]">{f.name}</span>
              <div className="rounded border border-[var(--border)] px-1">
                <Cell
                  field={f}
                  value={record.cells?.[f.id]}
                  onCommit={(value) =>
                    updateCell.mutate({ recordId: record.id, fieldId: f.id, value })
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            if (confirm("¿Borrar este registro?")) deleteRecord.mutate({ id: record.id });
          }}
          className="mt-8 text-sm text-[var(--muted)] hover:text-[var(--negative,#c93a2e)]"
        >
          🗑 Borrar registro
        </button>
      </div>
    </div>
  );
}
