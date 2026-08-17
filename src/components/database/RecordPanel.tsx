"use client";

import { useMemo, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { PartialBlock } from "@blocknote/core";
import { trpc } from "@/trpc/react";
import { Cell, type FieldLite } from "./Cell";
import { RelationCell } from "./RelationCell";
import { AddFieldButton } from "./shared";

type Rec = { id: string; cells: Record<string, unknown>; order: string; content?: unknown };

export function RecordPanel({
  pageId,
  collectionId,
  record,
  fields,
  onClose,
}: {
  pageId: string;
  collectionId?: string;
  record: Rec;
  fields: FieldLite[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });
  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const saveContent = trpc.db.updateRecordContent.useMutation();
  const deleteRecord = trpc.db.deleteRecord.useMutation({
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const titleField = fields.find((f) => f.type === "text") ?? fields[0];
  const [title, setTitle] = useState(
    titleField && typeof record.cells?.[titleField.id] === "string" ? (record.cells[titleField.id] as string) : "",
  );
  const propFields = fields.filter((f) => f.id !== titleField?.id);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useMemo<PartialBlock[] | undefined>(() => {
    const c = record.content as PartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);
  const editor = useCreateBlockNote({ initialContent: initial });

  const onBodyChange = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveContent.mutate({ id: record.id, content: editor.document }), 800);
  };

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (titleField) updateCell.mutate({ recordId: record.id, fieldId: titleField.id, value: v || null });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="h-dvh w-full max-w-xl overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 pt-5">
          <span className="text-xs text-[var(--muted)]">Ficha</span>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand" title="Cerrar">✕</button>
        </div>

        <div className="px-8 pb-10 pt-2">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Sin título"
            className="font-display mb-5 w-full bg-transparent text-3xl font-extrabold outline-none placeholder:text-[var(--border)]"
          />

          <div className="space-y-2">
            {propFields.map((f) => (
              <div key={f.id} className="grid grid-cols-[130px_1fr] items-center gap-3">
                <span className="truncate text-sm text-[var(--muted)]">{f.name}</span>
                <div className="rounded px-1 hover:bg-[var(--border)]/20">
                  {f.type === "relation" ? (
                    <RelationCell
                      field={f}
                      value={record.cells?.[f.id]}
                      onCommit={(value) => updateCell.mutate({ recordId: record.id, fieldId: f.id, value })}
                    />
                  ) : (
                    <Cell
                      field={f}
                      value={record.cells?.[f.id]}
                      rollupValue={computed?.rollups?.[record.id]?.[f.id]}
                      onCommit={(value) => updateCell.mutate({ recordId: record.id, fieldId: f.id, value })}
                    />
                  )}
                </div>
              </div>
            ))}
            {collectionId && (
              <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                <span className="text-sm text-[var(--muted)]">
                  <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
                </span>
                <span />
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <BlockNoteView editor={editor} onChange={onBodyChange} />
          </div>

          <button
            onClick={() => {
              if (confirm("¿Borrar este registro?")) deleteRecord.mutate({ id: record.id });
            }}
            className="mt-8 text-sm text-[var(--muted)] hover:text-red-500"
          >
            🗑 Borrar registro
          </button>
        </div>
      </div>
    </div>
  );
}
