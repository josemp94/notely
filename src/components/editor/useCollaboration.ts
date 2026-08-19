"use client";

import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { trpc } from "@/trpc/react";

/** Colores de cursor: estables por usuario, para reconocerse de un vistazo. */
const CURSOR_COLORS = ["#ff5c28", "#3b82f6", "#22c55e", "#a855f7", "#ef4444", "#eab308"];
const colorFor = (id: string) =>
  CURSOR_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CURSOR_COLORS.length];

export type Collaboration = {
  fragment: Y.XmlFragment;
  provider: HocuspocusProvider;
  user: { name: string; color: string };
};

/**
 * Conecta la página al servidor de edición simultánea, si la instalación tiene uno
 * (NEXT_PUBLIC_COLLAB_URL). Sin esa variable devuelve null y el editor sigue
 * funcionando como siempre, con su autosave: la colaboración es opcional.
 *
 * El token es la cookie de sesión, que el servidor de colaboración valida contra
 * la misma tabla Session que la web.
 */
export function useCollaboration(
  pageId: string,
  me?: { id: string; name: string | null; email: string } | null,
): Collaboration | null {
  const url = process.env.NEXT_PUBLIC_COLLAB_URL;
  const [ready, setReady] = useState<string | null>(null); // token de la sala
  const ensureYdoc = trpc.pages.ensureYdoc.useMutation();
  const collabToken = trpc.pages.collabToken.useMutation();

  // Antes de conectar hay que asegurarse de que el documento tiene estado Yjs,
  // o el primero en entrar vería la página vacía.
  const ensureMutate = ensureYdoc.mutateAsync;
  const tokenMutate = collabToken.mutateAsync;
  useEffect(() => {
    if (!url || !me) return;
    let cancelled = false;
    setReady(null);
    ensureMutate({ id: pageId })
      .then(() => tokenMutate({ id: pageId }))
      .then((r) => !cancelled && setReady(r.token))
      .catch(() => !cancelled && setReady(null)); // sin colaboración: el editor sigue funcionando
    return () => {
      cancelled = true;
    };
  }, [url, me, pageId, ensureMutate, tokenMutate]);

  const collab = useMemo(() => {
    if (!url || !ready || !me) return null;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url,
      name: pageId,
      document: doc,
      // Permiso firmado de corta vida emitido por la web para esta página.
      token: ready,
    });
    return {
      provider,
      fragment: doc.getXmlFragment("document-store"),
      user: { name: me.name || me.email || "Alguien", color: colorFor(me.id) },
    };
  }, [url, ready, me, pageId]);

  // Al cambiar de página se cierra la conexión anterior.
  useEffect(() => {
    return () => {
      collab?.provider.destroy();
    };
  }, [collab]);

  return collab;
}
