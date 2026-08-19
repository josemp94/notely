"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import { usePeople } from "./Cell";
import { displayValue, type FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const SIZES: Record<string, { grid: string; card: string; title: string }> = {
  small: { grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", card: "p-3 text-xs", title: "text-sm" },
  medium: { grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", card: "p-4 text-sm", title: "" },
  large: { grid: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3", card: "p-5 text-sm", title: "text-lg" },
};

export function GalleryView({
  pageId,
  collectionId,
  fields,
  records,
  cardSize,
  cardPreview,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  cardSize?: string;
  cardPreview?: string;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const people = usePeople();

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const size = SIZES[cardSize ?? "medium"] ?? SIZES.medium;
  const previewField = cardPreview && cardPreview !== "none" ? fields.find((f) => f.id === cardPreview) : undefined;
  const propFields = fields.filter((f) => f.id !== titleField?.id && f.id !== previewField?.id);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  return (
    <div>
      <div className={`grid gap-3 ${size.grid}`}>
        {records.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRec(r)}
            className={`flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] ${size.card} text-left shadow-sm transition hover:border-brand hover:shadow-md`}
          >
            <div className={`font-display truncate font-semibold ${size.title}`}>{recTitle(r)}</div>
            {previewField && (() => {
              const txt = displayValue(previewField, r.cells?.[previewField.id], people);
              if (!txt) return null;
              return (
                <div className="line-clamp-4 break-words rounded-md bg-[var(--border)]/30 p-2">{txt}</div>
              );
            })()}
            <div className="space-y-1">
              {propFields.map((f) => {
                const txt = displayValue(f, r.cells?.[f.id], people);
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
