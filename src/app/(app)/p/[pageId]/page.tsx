"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/trpc/react";
import { Editor } from "@/components/editor/Editor";
import { Database } from "@/components/database/Database";
import { CommentsButton, CommentsPanel } from "@/components/CommentsPanel";

export default function PageView() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const { data: page, isLoading, error } = trpc.pages.get.useQuery({ id: pageId });
  const { data: me } = trpc.auth.me.useQuery();
  const [comments, setComments] = useState(false);
  const canEdit = me?.wsRole !== "viewer";

  if (isLoading) {
    return <div className="px-12 py-16 text-[var(--muted)]">Cargando…</div>;
  }
  if (error || !page) {
    return <div className="px-12 py-16 text-[var(--muted)]">Página no encontrada.</div>;
  }

  return (
    <div className="relative flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        {page.type === "database" ? (
          <Database
            key={page.id}
            pageId={page.id}
            initialTitle={page.title || "Base de datos"}
            initialIcon={page.icon}
            initialCover={page.cover}
            canEdit={canEdit}
          />
        ) : (
          <Editor
            key={page.id}
            pageId={page.id}
            initialTitle={page.title}
            initialContent={page.content}
            initialIcon={page.icon}
            initialCover={page.cover}
            canEdit={canEdit}
          />
        )}
      </div>
      {comments ? (
        <CommentsPanel pageId={page.id} onClose={() => setComments(false)} />
      ) : (
        <div className="absolute right-3 top-2 z-10">
          <CommentsButton pageId={page.id} onClick={() => setComments(true)} />
        </div>
      )}
    </div>
  );
}
