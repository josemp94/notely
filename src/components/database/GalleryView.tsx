"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import { usePeople } from "./Cell";
import { displayValue, groupBy, rowColor, type FieldLite } from "@/lib/cellText";

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
  colorFieldId,
  groupByFieldId,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  cardSize?: string;
  cardPreview?: string;
  colorFieldId?: string;
  groupByFieldId?: string;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const [openRec, setOpenRec] = useState<Rec | null>(null);
  const people = usePeople();
  const colorField = fields.find((f) => f.id === colorFieldId);
  const groupField = fields.find((f) => f.id === groupByFieldId);

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const size = SIZES[cardSize ?? "medium"] ?? SIZES.medium;
  const previewField = cardPreview && cardPreview !== "none" ? fields.find((f) => f.id === cardPreview) : undefined;
  const propFields = fields.filter((f) => f.id !== titleField?.id && f.id !== previewField?.id);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  const groups = groupField ? groupBy(records, groupField, people) : [{ key: "", label: "", records }];

  return (
    <div className="space-y-5">
      {groups.map((g) => (
      <div key={g.key}>
      {groupField && (
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          {g.label}
          <span className="text-xs font-normal text-[var(--muted)]">{g.records.length}</span>
        </div>
      )}
      <div className={`grid gap-3 ${size.grid}`}>
        {g.records.map((r) => (
          <button
            key={r.id}
            onClick={() => setOpenRec(r)}
            style={{ background: rowColor(colorField, r.cells) }}
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

        {/* El botón de añadir va solo en el último grupo, para no repetirlo por sección. */}
        {g.key === groups.at(-1)?.key && (
          <button
            onClick={() => addRecord.mutate({ collectionId })}
            className="flex min-h-[92px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted)] transition hover:border-brand hover:text-brand"
          >
            + Nueva tarjeta
          </button>
        )}
      </div>
      </div>
      ))}

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
