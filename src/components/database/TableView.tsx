"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { Cell, type FieldLite } from "./Cell";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { RecordPanel } from "./RecordPanel";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

export function TableView({
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

  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.db.deleteField.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            <th className="w-8" />
            {fields.map((f) => (
              <th key={f.id} className="group min-w-40 px-2 py-1 font-medium">
                <span className="flex items-center gap-1">
                  {editingField === f.id ? (
                    <input
                      autoFocus
                      defaultValue={f.name}
                      onBlur={(e) => {
                        updateField.mutate({ id: f.id, name: e.target.value || f.name });
                        setEditingField(null);
                      }}
                      className="w-28 rounded border border-[var(--border)] px-1"
                    />
                  ) : (
                    <button onDoubleClick={() => setEditingField(f.id)} className="truncate">
                      {f.name}
                    </button>
                  )}
                  <span className="text-[10px] uppercase opacity-50">{FIELD_LABELS[f.type] ?? f.type}</span>
                  <button
                    onClick={() => {
                      if (confirm(`¿Borrar la columna "${f.name}"?`)) deleteField.mutate({ id: f.id });
                    }}
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    title="Borrar columna"
                  >
                    ✕
                  </button>
                </span>
              </th>
            ))}
            <th className="px-2 py-1">
              <AddFieldButton collectionId={collectionId} onDone={invalidate} />
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="group border-b border-[var(--border)] hover:bg-[var(--border)]/20">
              <td className="px-1 py-1 text-center">
                <button
                  onClick={() => setOpenRec(r)}
                  className="text-[var(--muted)] opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
                  title="Abrir ficha"
                >
                  ⤢
                </button>
              </td>
              {fields.map((f) => (
                <td key={f.id} className="px-2 py-1">
                  <Cell
                    field={f}
                    value={r.cells?.[f.id]}
                    onCommit={(value) =>
                      updateCell.mutate({ recordId: r.id, fieldId: f.id, value })
                    }
                  />
                </td>
              ))}
              <td className="px-2 py-1">
                <button
                  onClick={() => deleteRecord.mutate({ id: r.id })}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Borrar fila"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => addRecord.mutate({ collectionId })}
        className="mt-2 px-2 py-1 text-sm text-[var(--muted)] hover:text-brand"
      >
        + Nueva fila
      </button>

      {openRec &&
        (() => {
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          return (
            <RecordPanel
              pageId={pageId}
              record={fresh}
              fields={fields}
              onClose={() => setOpenRec(null)}
            />
          );
        })()}
    </div>
  );
}
