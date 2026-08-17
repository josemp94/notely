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

/** Chip de mención de persona: @nombre en azul (distinto de las páginas, en naranja de marca). */
const PersonMention = createReactInlineContentSpec(
  {
    type: "personMention",
    propSchema: {
      userId: { default: "" },
      name: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <span className="whitespace-nowrap rounded bg-sky-500/15 px-1 font-medium text-sky-600">
        @{inlineContent.props.name || "alguien"}
      </span>
    ),
  },
);

/** Schema compartido por todos los editores BlockNote de la app (registra "mention" y "personMention"). */
export const editorSchema = BlockNoteSchema.create({
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention, personMention: PersonMention },
});

export type NotelyEditor = typeof editorSchema.BlockNoteEditor;
export type NotelyPartialBlock = typeof editorSchema.PartialBlock;

/** Menú "@": personas del espacio (workspace.members) y páginas (pages.search). */
export function MentionMenu({ editor, pageId }: { editor: NotelyEditor; pageId: string }) {
  const utils = trpc.useUtils();
  const notify = trpc.notifications.notifyMention.useMutation();
  return (
    <SuggestionMenuController
      triggerCharacter="@"
      getItems={async (query) => {
        const q = query.trim().toLowerCase();
        const [pages, ws] = await Promise.all([
          q ? utils.pages.search.fetch({ query }) : utils.pages.tree.fetch().then((t) => t.slice(0, 10)),
          utils.workspace.members.fetch(),
        ]);
        const people = ws.members.filter(
          (m) => !q || (m.name ?? "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
        );
        return [
          ...people.map((m) => ({
            title: `@${m.name || m.email}`,
            subtext: m.email,
            group: "Personas",
            onItemClick: () => {
              editor.insertInlineContent([
                { type: "personMention", props: { userId: m.userId, name: m.name || m.email } },
                " ",
              ]);
              notify.mutate({ pageId, userId: m.userId });
            },
          })),
          ...pages.map((p) => ({
            title: `${p.icon ?? "📄"} ${p.title || "Sin título"}`,
            group: "Páginas",
            onItemClick: () => {
              editor.insertInlineContent([
                { type: "mention", props: { pageId: p.id, title: p.title || "Sin título", icon: p.icon ?? "" } },
                " ",
              ]);
            },
          })),
        ];
      }}
    />
  );
}
