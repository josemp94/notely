"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/trpc/react";

/**
 * BD en vivo, camino corto: la sala Yjs de la página —que en las páginas-BD no
 * transporta contenido— se usa como canal de señal. Cada mutación db.* que hago
 * yo sube un contador compartido; cuando lo veo subir desde fuera (tx remota),
 * refresco db.get. No es CRDT: el merge por celda del servidor evita pisarse,
 * esto solo hace que los cambios de otros aparezcan al momento.
 *
 * Sin permiso de edición en la página el token falla y la BD simplemente no es
 * en vivo (se queda como hasta ahora: al refetch normal).
 */
export function useDbLive(pageId: string) {
  const utils = trpc.useUtils();
  const qc = useQueryClient();
  const collabToken = trpc.pages.collabToken.useMutation();
  // Refs para que el efecto no se rearme con cada render.
  const tokenRef = useRef(collabToken.mutateAsync);
  tokenRef.current = collabToken.mutateAsync;
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_COLLAB_URL;
    if (!url) return;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url,
      name: pageId,
      document: doc,
      token: async () => (await tokenRef.current({ id: pageId })).token,
      // Sin permiso no hay señal: se corta y ya, nada de reintentar en bucle.
      onAuthenticationFailed: () => provider.destroy(),
    });
    const mapa = doc.getMap<number>("dbLive");

    // Señal remota → refrescar los datos de ESTA base de datos.
    const observa = (_e: Y.YMapEvent<number>, tx: Y.Transaction) => {
      if (tx.local) return;
      utilsRef.current.db.get.invalidate({ pageId });
      utilsRef.current.db.computed.invalidate({ pageId });
    };
    mapa.observe(observa);

    // Mutación db.* mía completada → avisar a los demás. Se escucha la caché de
    // mutaciones global (toda mutación de tRPC lleva su ruta en mutationKey), así
    // no hay que tocar cada componente que muta. ponytail: con varias BDs en
    // pantalla cada una avisa a su sala aunque el cambio fuera de otra; el coste
    // es un refetch de más en quien mira, no datos malos.
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type !== "updated" || e.action?.type !== "success") return;
      const key = e.mutation.options.mutationKey;
      const ruta = Array.isArray(key) && Array.isArray(key[0]) ? (key[0] as string[]) : null;
      if (ruta?.[0] === "db") mapa.set("v", (mapa.get("v") ?? 0) + 1);
    });

    return () => {
      unsub();
      mapa.unobserve(observa);
      provider.destroy();
      doc.destroy();
    };
  }, [pageId, qc]);
}
