"use client";

import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactInlineContentSpec, SuggestionMenuController } from "@blocknote/react";
import { trpc } from "@/trpc/react";

/** Chip de mención inline: icono + título de la página, enlaza a /p/<id>. */
const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      pageId: { default: "" },
      title: { default: "" },
      icon: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <a
        href={`/p/${inlineContent.props.pageId}`}
        className="whitespace-nowrap rounded bg-brand-50 px-1 font-medium text-brand no-underline hover:underline"
      >
        {inlineContent.props.icon || "📄"} {inlineContent.props.title || "Sin título"}
      </a>
    ),
  },
);

/** Schema compartido por todos los editores BlockNote de la app (registra "mention"). */
export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
});

export type NotelyEditor = typeof editorSchema.BlockNoteEditor;
export type NotelyPartialBlock = typeof editorSchema.PartialBlock;

/** Menú "@": busca páginas por título (pages.search) e inserta una mención. */
export function MentionMenu({ editor }: { editor: NotelyEditor }) {
  const utils = trpc.useUtils();
  return (
    <SuggestionMenuController
      triggerCharacter="@"
      getItems={async (query) => {
        const pages = query.trim()
          ? await utils.pages.search.fetch({ query })
          : (await utils.pages.tree.fetch()).slice(0, 10);
        return pages.map((p) => ({
          title: `${p.icon ?? "📄"} ${p.title || "Sin título"}`,
          onItemClick: () => {
            editor.insertInlineContent([
              { type: "mention", props: { pageId: p.id, title: p.title || "Sin título", icon: p.icon ?? "" } },
              " ",
            ]);
          },
        }));
      }}
    />
  );
}
