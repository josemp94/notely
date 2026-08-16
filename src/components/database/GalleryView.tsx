"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import { optionsOf, type FieldLite } from "./Cell";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

/** Muestra el valor de una celda como texto para la tarjeta. */
function displayValue(field: FieldLite, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "select") {
    return optionsOf(field).find((o) => o.id === value)?.label ?? String(value);
  }
  if (field.type === "checkbox") return value ? "Sí" : "No";
  return String(value);
}

export function GalleryView({
  pageId,
  collectionId,
  fields,
  records,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const propFields = fields.filter((f) => f.id !== titleField?.id);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {records.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRec(r)}
            className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-left shadow-sm transition hover:border-brand hover:shadow-md"
          >
            <div className="font-display truncate font-semibold">{recTitle(r)}</div>
            <div className="space-y-1">
              {propFields.map((f) => {
                const txt = displayValue(f, r.cells?.[f.id]);
                if (!txt) return null;
                return (
                  <div key={f.id} className="flex gap-2 text-xs">
                    <span className="shrink-0 text-[var(--muted)]">{f.name}:</span>
                    <span className="truncate">{txt}</span>
                  </div>
                );
              })}
            </div>
          </button>
        ))}

        <button
          onClick={() => addRecord.mutate({ collectionId })}
          className="flex min-h-[92px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)] transition hover:border-brand hover:text-brand"
        >
          + Nueva tarjeta
        </button>
      </div>

      {openRec && (
        <RecordPanel
          pageId={pageId}
          record={openRec}
          fields={fields}
          onClose={() => setOpenRec(null)}
        />
      )}
    </div>
  );
}
