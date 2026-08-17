"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, type NotelyPartialBlock } from "@/components/editor/mention";
import { coverStyle } from "@/components/PageCover";

/** Render público de solo lectura: portada, icono, título y contenido (doc o tabla). */
export function PublicView({
  title,
  icon,
  cover,
  content,
  table,
}: {
  title: string;
  icon: string | null;
  cover: string | null;
  content: unknown;
  table: { headers: string[]; rows: string[][] } | null;
}) {
  return (
    <div className="min-h-dvh">
      {cover && <div className="h-40 w-full" style={coverStyle(cover)} />}
      <div className={`mx-auto max-w-3xl px-4 pb-10 md:px-12 ${cover ? "pt-3" : "pt-10 md:pt-16"}`}>
        {icon && <div className={`mb-2 text-5xl ${cover ? "relative -mt-12" : ""}`}>{icon}</div>}
        <h1 className="font-display mb-6 text-4xl font-extrabold md:text-5xl">{title || "Sin título"}</h1>
        {table ? <PublicTable table={table} /> : <PublicDoc content={content} />}
        <footer className="mt-16 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          Publicado con{" "}
          <span className="font-display font-bold">
            No<span className="text-brand">tio</span>no
          </span>
        </footer>
      </div>
    </div>
  );
}

function PublicDoc({ content }: { content: unknown }) {
  const blocks = content as NotelyPartialBlock[] | undefined;
  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined,
  });
  return <BlockNoteView editor={editor} editable={false} />;
}

function PublicTable({ table }: { table: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            {table.headers.map((h, i) => (
              <th key={i} className="min-w-32 px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border)]">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 px-2 text-xs text-[var(--muted)]">{table.rows.length} filas</div>
    </div>
  );
}
