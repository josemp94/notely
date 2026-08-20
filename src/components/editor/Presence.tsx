"use client";

import { useEffect, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

type Persona = { name: string; color: string };

/**
 * Quién está viendo la página ahora mismo. La información viaja por el canal de
 * presencia (awareness) que ya abre la edición simultánea: no hace falta nada más.
 */
export function Presence({ provider }: { provider: HocuspocusProvider }) {
  const [gente, setGente] = useState<Persona[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const actualizar = () => {
      const vistos = new Map<string, Persona>();
      for (const [clientId, estado] of awareness.getStates()) {
        // El propio cliente no se cuenta: uno ya sabe que está aquí.
        if (clientId === awareness.clientID) continue;
        const user = (estado as { user?: Persona }).user;
        if (user?.name) vistos.set(`${user.name}|${user.color}`, user);
      }
      setGente([...vistos.values()]);
    };
    actualizar();
    awareness.on("change", actualizar);
    return () => awareness.off("change", actualizar);
  }, [provider]);

  if (!gente.length) return null;

  return (
    <div className="flex items-center -space-x-1.5" title={`${gente.map((p) => p.name).join(", ")} en esta página`}>
      {gente.slice(0, 4).map((p) => (
        <span
          key={p.name + p.color}
          className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--background)] text-[11px] font-semibold text-white"
          style={{ background: p.color }}
        >
          {p.name.trim().charAt(0).toUpperCase()}
        </span>
      ))}
      {gente.length > 4 && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--muted)] text-[10px] font-semibold text-white">
          +{gente.length - 4}
        </span>
      )}
    </div>
  );
}
