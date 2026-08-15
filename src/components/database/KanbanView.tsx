"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { optionsOf, type FieldLite } from "./Cell";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const COLORS: Record<string, string> = {
  gray: "#f1ede7",
  orange: "#fff1ec",
  green: "#eafaf0",
  red: "#fff0ee",
  blue: "#eef4ff",
  yellow: "#fdf6e3",
};

export function KanbanView({
  pageId,
  collectionId,
  fields,
  records,
  groupByFieldId,
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  groupByFieldId?: string;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const [dragId, setDragId] = useState<string | null>(null);

  const groupField =
    fields.find((f) => f.id === groupByFieldId && f.type === "select") ??
    fields.find((f) => f.type === "select");
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];

  if (!groupField) {
    return (
      <p className="px-2 py-6 text-[var(--muted)]">
        Añade un campo de tipo <b>Selección</b> para usar la vista Kanban.
      </p>
    );
  }

  const options = optionsOf(groupField);
  const columns = [
    ...options.map((o) => ({ id: o.id, label: o.label, color: o.color ?? "gray" })),
    { id: "", label: "Sin asignar", color: "gray" },
  ];

  const cardTitle = (r: Rec) => {
    const v = titleField ? r.cells?.[titleField.id] : undefined;
    return (typeof v === "string" && v) || "Sin título";
  };

  function drop(colId: string) {
    if (!dragId) return;
    updateCell.mutate({ recordId: dragId, fieldId: groupField!.id, value: colId || null });
    setDragId(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const cards = records.filter((r) => (r.cells?.[groupField.id] ?? "") === col.id);
        return (
          <div
            key={col.id || "none"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(col.id)}
            className="w-64 shrink-0 rounded-lg p-2"
            style={{ background: COLORS[col.color] ?? "#f1ede7" }}
          >
            <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
              <span>{col.label}</span>
              <span className="text-[var(--muted)]">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {cards.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  className="cursor-grab rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm shadow-sm active:cursor-grabbing"
                >
                  {cardTitle(r)}
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                addRecord.mutate({ collectionId, cells: col.id ? { [groupField.id]: col.id } : {} })
              }
              className="mt-2 w-full rounded px-2 py-1 text-left text-sm text-[var(--muted)] hover:text-brand"
            >
              + Nueva
            </button>
          </div>
        );
      })}
    </div>
  );
}
