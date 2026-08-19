"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Database, Download } from "lucide-react";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from "@blocknote/react";
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

  const initial = useMemo<NotionoPartialBlock[] | undefined>(() => {
    const c = initialContent as NotionoPartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
  }, [initialContent]);

  const editor = useCreateBlockNote({ schema: editorSchema, initialContent: initial });

  function scheduleSave() {
    if (!canEdit) return;
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
        <MentionMenu editor={editor} pageId={pageId} />
        {/* Menú "/" propio: los ítems por defecto + "Base de datos" embebida. */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
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
              ],
              query,
            )
          }
        />
      </BlockNoteView>
      </div>
    </div>
  );
}
