"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useParams } from "next/navigation";
import { trpc } from "@/trpc/react";
import { pushRecent } from "@/lib/recents";
import { Editor } from "@/components/editor/Editor";
import { Database } from "@/components/database/Database";
import { CommentsButton, CommentsPanel } from "@/components/CommentsPanel";
import { HistoryButton, VersionHistoryModal } from "@/components/VersionHistory";
import { ShareButton } from "@/components/SharePublish";

export default function PageView() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const utils = trpc.useUtils();
  const { data: page, isLoading, error } = trpc.pages.get.useQuery({ id: pageId });
  const { data: me } = trpc.auth.me.useQuery();
  const [comments, setComments] = useState(false);
  const [history, setHistory] = useState(false);
  // Remonta el editor tras restaurar una versión (initialContent solo se lee al montar).
  const [editorEpoch, setEditorEpoch] = useState(0);
  const canEdit = me?.wsRole !== "viewer";

  // Registra la visita en 🕘 Recientes (localStorage, por workspace).
  const workspaceId = me?.workspace?.id;
  useEffect(() => {
    if (page && workspaceId) pushRecent(workspaceId, { id: page.id, title: page.title, icon: page.icon });
  }, [page, workspaceId]);

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
            key={`${page.id}:${editorEpoch}`}
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
        <div className="absolute right-3 top-2 z-10 flex items-center gap-1">
          {canEdit && <FavoriteButton pageId={page.id} />}
          {canEdit && <ShareButton pageId={page.id} publicToken={page.publicToken} />}
          {page.type !== "database" && <HistoryButton onClick={() => setHistory(true)} />}
          <CommentsButton pageId={page.id} onClick={() => setComments(true)} />
        </div>
      )}
      {history && (
        <VersionHistoryModal
          pageId={page.id}
          canEdit={canEdit}
          onClose={() => setHistory(false)}
          onRestored={async () => {
            await utils.pages.get.invalidate({ id: pageId });
            setEditorEpoch((e) => e + 1);
          }}
        />
      )}
    </div>
  );
}

/** Estrella de la cabecera: añade/quita la página de Favoritos. */
function FavoriteButton({ pageId }: { pageId: string }) {
  const utils = trpc.useUtils();
  const { data: favs } = trpc.favorites.list.useQuery();
  const isFav = (favs ?? []).some((f) => f.id === pageId);
  const toggle = trpc.pages.toggleFavorite.useMutation({
    onSuccess: () => utils.favorites.list.invalidate(),
  });
  return (
    <button
      onClick={() => toggle.mutate({ pageId })}
      disabled={toggle.isPending}
      className={`rounded-md px-2 py-1 text-sm hover:bg-brand-50 ${isFav ? "text-brand" : "text-[var(--muted)] hover:text-brand"}`}
      title={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
    >
      <Star size={16} fill={isFav ? "currentColor" : "none"} />
    </button>
  );
}
