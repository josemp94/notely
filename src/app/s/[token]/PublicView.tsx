"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, type NotelyPartialBlock } from "@/components/editor/mention";
import { PublicDbContext, StaticDbTable, type PublicDbTable } from "@/components/editor/databaseBlock";
import { coverStyle } from "@/components/PageCover";
import { useTheme } from "@/lib/theme";

/** Render público de solo lectura: portada, icono, título y contenido (doc o tabla). */
export function PublicView({
  title,
  icon,
  cover,
  content,
  table,
  dbTables,
}: {
  title: string;
  icon: string | null;
  cover: string | null;
  content: unknown;
  table: PublicDbTable | null;
  dbTables: Record<string, PublicDbTable>;
}) {
  return (
    <div className="min-h-dvh">
      {cover && <div className="h-40 w-full" style={coverStyle(cover)} />}
      <div className={`mx-auto max-w-3xl px-4 pb-10 md:px-12 ${cover ? "pt-3" : "pt-10 md:pt-16"}`}>
        {icon && <div className={`mb-2 text-5xl ${cover ? "relative -mt-12" : ""}`}>{icon}</div>}
        <h1 className="font-display mb-6 text-4xl font-extrabold md:text-5xl">{title || "Sin título"}</h1>
        {table ? (
          <StaticDbTable table={table} />
        ) : (
          <PublicDbContext.Provider value={dbTables}>
            <PublicDoc content={content} />
          </PublicDbContext.Provider>
        )}
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
  const theme = useTheme();
  const blocks = content as NotelyPartialBlock[] | undefined;
  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: Array.isArray(blocks) && blocks.length > 0 ? blocks : undefined,
  });
  return <BlockNoteView editor={editor} editable={false} theme={theme} />;
}
