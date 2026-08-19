"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import { usePeople } from "./Cell";
import { displayValue, type FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

export function ListView({
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
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: () => utils.db.get.invalidate({ pageId }) });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const people = usePeople();

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const propFields = fields.filter((f) => f.id !== titleField?.id).slice(0, 3);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  return (
    <div>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {records.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setOpenRec(r)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--border)]/30"
            >
              <FileText size={14} className="shrink-0 text-[var(--muted)]" />
              <span className="min-w-0 flex-1 truncate font-medium">{recTitle(r)}</span>
              <span className="hidden shrink-0 items-center gap-3 text-xs text-[var(--muted)] sm:flex">
                {propFields.map((f) => {
                  const txt = displayValue(f, r.cells?.[f.id], people);
                  if (!txt) return null;
                  return (
                    <span key={f.id} className="truncate">
                      {txt}
                    </span>
                  );
                })}
              </span>
            </button>
          </li>
        ))}
        {records.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">Sin registros.</li>
        )}
      </ul>

      <button
        onClick={() => addRecord.mutate({ collectionId })}
        className="mt-2 text-sm text-[var(--muted)] hover:text-brand"
      >
        + Nueva fila
      </button>

      {openRec && (
        <RecordPanel pageId={pageId} record={openRec} fields={fields} onClose={() => setOpenRec(null)} />
      )}
    </div>
  );
}
