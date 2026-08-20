"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Database, Download, FileText, Lightbulb, Link as LinkIcon, Link2, ListTree } from "lucide-react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import {
  FloatingComposerController,
  FloatingThreadController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { es } from "@blocknote/core/locales";
import { CommentsExtension } from "@blocknote/core/comments";
import { withCollaboration } from "@blocknote/core/yjs";
import { useCollaboration } from "./useCollaboration";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { editorSchema, MentionMenu, type NotionoPartialBlock } from "./mention";
import { trpc } from "@/trpc/react";
import { downloadText } from "@/lib/download";
import { useTheme } from "@/lib/theme";
import { PageIcon } from "@/components/PageIcon";
import { AddCoverButton, CoverBand } from "@/components/PageCover";

type SaveState = "saved" | "saving" | "idle";

export function Editor({
  pageId,
  initialTitle,
  initialContent,
  initialIcon,
  initialCover,
  fullWidth = false,
  canEdit = true,
}: {
  pageId: string;
  initialTitle: string;
  initialContent: unknown;
  initialIcon?: string | null;
  initialCover?: string | null;
  fullWidth?: boolean;
  canEdit?: boolean;
}) {
  const utils = trpc.useUtils();
  const theme = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContent = trpc.pages.updateContent.useMutation({
    onSuccess: () => setSaveState("saved"),
  });
  const rename = trpc.pages.rename.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });
  const setCoverM = trpc.pages.setCover.useMutation();
  const createInlineDb = trpc.db.createInline.useMutation();
  const linkPreview = trpc.pages.linkPreview.useMutation();

  const initial = useMemo<NotionoPartialBlock[] | undefined>(() => {
    const c = initialContent as NotionoPartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
  }, [initialContent]);

  // Edición simultánea: si la instalación tiene servidor de colaboración, el
  // documento se sincroniza en vivo; si no, el editor funciona como siempre.
  const { data: me } = trpc.auth.me.useQuery();
  const collab = useCollaboration(pageId, me);

  const editor = useCreateBlockNote(
    collab
      ? withCollaboration({
          dictionary: es,
          schema: editorSchema,
          // Comentarios en línea: los hilos viven en el mismo documento compartido,
          // así que se sincronizan y se guardan con él, sin modelo aparte.
          extensions: [
            CommentsExtension({ threadStore: collab.threadStore, resolveUsers: collab.userStore }),
          ],
          collaboration: {
            // El proveedor expone awareness como null hasta conectar; el tipo de
            // BlockNote lo espera opcional.
            provider: collab.provider as unknown as { awareness: undefined },
            fragment: collab.fragment,
            user: collab.user,
            resolveUsers: collab.userStore,
            showCursorLabels: "activity",
          },
        })
      : { dictionary: es, schema: editorSchema, initialContent: initial },
    [collab],
  );

  function scheduleSave() {
    if (!canEdit) return;
    // En modo colaborativo el estado vive en el servidor de Yjs; aquí solo se
    // refresca la copia legible (Page.content) que usan búsqueda, publicación y
    // export. Todos los editores abiertos guardan lo mismo, así que es inocuo.
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveContent.mutate({ id: pageId, content: editor.document });
    }, 800);
  }

  function persist(nextTitle: string, nextIcon: string | null) {
    setSaveState("saving");
    rename.mutate(
      { id: pageId, title: nextTitle, icon: nextIcon },
      { onSuccess: () => setSaveState("saved") },
    );
  }

  function onTitleChange(v: string) {
    setTitle(v);
    setSaveState("saving");
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => persist(v, icon), 600);
  }

  function onIconChange(next: string | null) {
    setIcon(next);
    persist(title, next);
  }

  function onCoverChange(next: string | null) {
    setCover(next);
    setCoverM.mutate({ id: pageId, cover: next });
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  return (
    <div>
      {cover && <CoverBand cover={cover} onChange={onCoverChange} editable={canEdit} />}
      <div className={`mx-auto ${fullWidth ? "max-w-none" : "max-w-3xl"} px-4 pb-6 md:px-12 md:pb-14 ${cover ? "pt-3" : "pt-6 md:pt-14"}`}>
      <div className={`mb-3 flex h-4 items-center gap-2 font-mono text-[11px] text-[var(--muted)] ${cover ? "justify-end" : ""}`}>
        {canEdit ? (
          saveState === "saving" ? (
            "Guardando…"
          ) : (
            <span className="flex items-center gap-1">
              Guardado <Check size={12} />
            </span>
          )
        ) : (
          "Solo lectura"
        )}
        <button
          onClick={() =>
            downloadText(`${title.trim() || "Sin título"}.md`, editor.blocksToMarkdownLossy(editor.document), "text/markdown")
          }
          className="flex items-center gap-1 rounded px-1.5 hover:bg-brand-50 hover:text-brand"
          title="Exportar a Markdown"
        >
          <Download size={12} /> MD
        </button>
      </div>

      <div className="group/header">
        {icon && (
          <div className={`mb-1 ${cover ? "relative z-10 -mt-14" : ""}`}>
            <PageIcon icon={icon} onChange={onIconChange} editable={canEdit} />
          </div>
        )}
        {canEdit && (!icon || !cover) && (
          <div className="mb-1 flex h-7 items-center gap-1">
            {!icon && <PageIcon icon={null} onChange={onIconChange} editable={canEdit} />}
            {!cover && <AddCoverButton onChange={onCoverChange} />}
          </div>
        )}
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Sin título"
          readOnly={!canEdit}
          className="font-display mb-3 w-full bg-transparent text-4xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-5xl"
        />
      </div>

      <BlockNoteView editor={editor} editable={canEdit} onChange={scheduleSave} slashMenu={false} theme={theme}>
        {/* Comentar una selección: el compositor y el hilo flotante solo existen
            con la edición simultánea activa, que es donde viven los hilos. */}
        {collab && (
          <>
            <FloatingComposerController />
            <FloatingThreadController />
          </>
        )}
        <MentionMenu editor={editor} pageId={pageId} />
        {/* Menú "/" propio: los ítems por defecto + "Base de datos" embebida. */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: "Llamada",
                  subtext: "Bloque destacado con icono",
                  aliases: ["callout", "llamada", "destacado", "aviso", "nota"],
                  group: "Bloques básicos",
                  icon: <Lightbulb size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
                },
                {
                  title: "Enlace web",
                  subtext: "Tarjeta con la vista previa, o el vídeo incrustado",
                  aliases: ["enlace", "link", "bookmark", "marcador", "youtube", "video", "vídeo", "embed"],
                  group: "Bloques básicos",
                  icon: <LinkIcon size={18} />,
                  onItemClick: async () => {
                    const url = prompt("Pega la dirección del enlace o del vídeo");
                    if (!url?.trim()) return;
                    // Si la vista previa falla (sitio caído o que bloquea bots), se inserta igual con la URL.
                    const preview = await linkPreview
                      .mutateAsync({ url: url.trim() })
                      .catch(() => ({ url: url.trim(), title: url.trim(), description: "", image: "", siteName: "" }));
                    insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark", props: preview });
                  },
                },
                {
                  title: "Tabla de contenidos",
                  subtext: "Índice de los encabezados de la página",
                  aliases: ["toc", "indice", "índice", "contenidos", "tabla de contenidos"],
                  group: "Bloques básicos",
                  icon: <ListTree size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "toc" }),
                },
                {
                  title: "Base de datos",
                  subtext: "Tabla embebida en esta página",
                  aliases: ["bd", "db", "tabla", "database", "base de datos"],
                  group: "Bases de datos",
                  icon: <Database size={18} />,
                  onItemClick: async () => {
                    const { pageId: dbPageId, collectionId } = await createInlineDb.mutateAsync();
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "database",
                      props: { collectionId, pageId: dbPageId },
                    });
                  },
                },
                // Vista enlazada: apunta a una BD que ya existe, no crea otra.
                ...(await utils.db.listDatabases.fetch()).map((d) => ({
                  title: `Enlazar: ${d.title || "Sin título"}`,
                  subtext: "Vista de una base de datos que ya existe",
                  aliases: ["enlazar", "linked", "vista", d.title?.toLowerCase() ?? ""],
                  group: "Bases de datos",
                  icon: <Link2 size={18} />,
                  onItemClick: () =>
                    insertOrUpdateBlockForSlashMenu(editor, {
                      type: "database",
                      props: { collectionId: d.collectionId, pageId: d.pageId },
                    }),
                })),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
      <Backlinks pageId={pageId} />
      </div>
    </div>
  );
}

/** "Enlaces entrantes": otras páginas que mencionan a esta. Oculto si no hay ninguna. */
function Backlinks({ pageId }: { pageId: string }) {
  const { data } = trpc.pages.backlinks.useQuery({ id: pageId });
  if (!data?.length) return null;
  return (
    <div className="mt-10 border-t border-[var(--border)] pt-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {data.length} enlace{data.length > 1 ? "s" : ""} entrante{data.length > 1 ? "s" : ""}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {data.map((p) => (
          <li key={p.id}>
            <Link href={`/p/${p.id}`} className="flex items-center gap-1.5 py-0.5 text-sm hover:text-brand">
              <span className="flex items-center text-[var(--muted)]">
                {p.icon ?? (p.type === "database" ? <Database size={14} /> : <FileText size={14} />)}
              </span>
              {p.title || "Sin título"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
