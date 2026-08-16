"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { PartialBlock } from "@blocknote/core";
import { trpc } from "@/trpc/react";

type SaveState = "saved" | "saving" | "idle";

export function Editor({
  pageId,
  initialTitle,
  initialContent,
}: {
  pageId: string;
  initialTitle: string;
  initialContent: unknown;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContent = trpc.pages.updateContent.useMutation({
    onSuccess: () => setSaveState("saved"),
  });
  const rename = trpc.pages.rename.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });

  const initial = useMemo<PartialBlock[] | undefined>(() => {
    const c = initialContent as PartialBlock[] | undefined;
    return Array.isArray(c) && c.length > 0 ? c : undefined;
  }, [initialContent]);

  const editor = useCreateBlockNote({ initialContent: initial });

  function scheduleSave() {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveContent.mutate({ id: pageId, content: editor.document });
    }, 800);
  }

  function onTitleChange(v: string) {
    setTitle(v);
    setSaveState("saving");
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      rename.mutate({ id: pageId, title: v }, { onSuccess: () => setSaveState("saved") });
    }, 600);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-12 md:py-16">
      <div className="mb-2 flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
        {saveState === "saving" ? "Guardando…" : "Guardado ✓"}
      </div>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Sin título"
        className="font-display mb-4 w-full bg-transparent text-3xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-4xl"
      />
      <BlockNoteView editor={editor} onChange={scheduleSave} />
    </div>
  );
}
