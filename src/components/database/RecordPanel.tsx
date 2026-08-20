"use client";

import { useMemo, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, type NotionoPartialBlock } from "@/components/editor/mention";
import { trpc } from "@/trpc/react";
import { useTheme } from "@/lib/theme";
import { Cell } from "./Cell";
import { type FieldLite } from "@/lib/cellText";
import { RelationCell } from "./RelationCell";
import { AddFieldButton } from "./shared";

type Rec = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  content?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
};

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
  const theme = useTheme();
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

  const saveTemplate = trpc.db.saveTemplate.useMutation({
    onSuccess: () => utils.db.get.invalidate({ pageId }),
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useMemo<NotionoPartialBlock[] | undefined>(() => {
    const c = record.content as NotionoPartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id]);
  const editor = useCreateBlockNote({ dictionary: es, schema: editorSchema, initialContent: initial });

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
        <div className="zona-segura-arriba flex items-center justify-between px-4 md:px-8">
          <button
            onClick={() => {
              const name = prompt("Nombre de la plantilla", title || "Plantilla");
              if (name?.trim()) saveTemplate.mutate({ recordId: record.id, name: name.trim() });
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            title="Guardar estos valores como plantilla de fila"
          >
            Guardar como plantilla
          </button>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar"><X size={16} /></button>
        </div>

        <div className="px-4 pb-10 pt-2 md:px-8">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Sin título"
            className="font-display mb-5 w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-3xl"
          />

          <div className="space-y-2">
            {propFields.map((f) => (
              <div key={f.id} className="grid grid-cols-[110px_1fr] items-center gap-3 md:grid-cols-[130px_1fr]">
                <span className="truncate text-sm text-[var(--muted)]">{f.name}</span>
                <div className="min-w-0 rounded px-1 hover:bg-[var(--border)]/20">
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
                      createdAt={record.createdAt}
                      updatedAt={record.updatedAt}
                      createdById={record.createdById}
                      updatedById={record.updatedById}
                      seq={record.seq}
                      onCommit={(value) => updateCell.mutate({ recordId: record.id, fieldId: f.id, value })}
                    />
                  )}
                </div>
              </div>
            ))}
            {collectionId && (
              <div className="grid grid-cols-[110px_1fr] items-center gap-3 md:grid-cols-[130px_1fr]">
                <span className="text-sm text-[var(--muted)]">
                  <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
                </span>
                <span />
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <BlockNoteView editor={editor} onChange={onBodyChange} theme={theme}>
              <MentionMenu editor={editor} pageId={pageId} />
            </BlockNoteView>
          </div>

          <button
            onClick={() => {
              if (confirm("¿Borrar este registro?")) deleteRecord.mutate({ id: record.id });
            }}
            className="mt-8 flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-red-500"
          >
            <Trash2 size={14} /> Borrar registro
          </button>
        </div>
      </div>
    </div>
  );
}
