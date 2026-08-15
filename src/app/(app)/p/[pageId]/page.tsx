"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/trpc/react";
import { Editor } from "@/components/editor/Editor";

export default function PageView() {
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const { data: page, isLoading, error } = trpc.pages.get.useQuery({ id: pageId });

  if (isLoading) {
    return <div className="px-12 py-16 text-[var(--muted)]">Cargando…</div>;
  }
  if (error || !page) {
    return <div className="px-12 py-16 text-[var(--muted)]">Página no encontrada.</div>;
  }

  return (
    <Editor
      key={page.id}
      pageId={page.id}
      initialTitle={page.title}
      initialContent={page.content}
    />
  );
}
