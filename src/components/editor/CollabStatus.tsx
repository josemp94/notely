"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

/**
 * Estado de la conexión con el servidor de edición simultánea.
 *
 * Existe porque el fallo era invisible: si el permiso caducaba o se caía la red,
 * el editor seguía escribiendo en la copia local sin avisar de que nadie más
 * estaba viendo esos cambios. Solo se muestra cuando algo no va bien.
 */
export function CollabStatus({ provider }: { provider: HocuspocusProvider | null }) {
  const [estado, setEstado] = useState<"conectando" | "conectado" | "desconectado">("conectando");

  useEffect(() => {
    // Sin proveedor no se llegó ni a conectar (la página no pudo prepararse):
    // el editor guarda igual, pero a solas, y eso hay que decirlo.
    if (!provider) {
      setEstado("desconectado");
      return;
    }
    const conectado = () => setEstado("conectado");
    const desconectado = () => setEstado("desconectado");
    const conectando = () => setEstado("conectando");

    provider.on("synced", conectado);
    provider.on("disconnect", desconectado);
    provider.on("connect", conectando);
    provider.on("authenticationFailed", desconectado);
    // Estado inicial: el proveedor pudo conectar antes de montarse este aviso.
    if (provider.isSynced) setEstado("conectado");

    return () => {
      provider.off("synced", conectado);
      provider.off("disconnect", desconectado);
      provider.off("connect", conectando);
      provider.off("authenticationFailed", desconectado);
    };
  }, [provider]);

  if (estado === "conectado") return null; // todo bien: no molestar

  return estado === "conectando" ? (
    <span className="flex items-center gap-1 text-[var(--muted)]" title="Conectando con el servidor para editar a la vez">
      <RefreshCw size={12} className="animate-spin" /> Conectando…
    </span>
  ) : (
    <span
      className="flex items-center gap-1 text-amber-600"
      title="Los cambios se guardan en este dispositivo, pero ahora mismo no se están compartiendo con los demás. Se enviarán al recuperar la conexión."
    >
      <CloudOff size={12} /> Sin sincronizar
    </span>
  );
}
