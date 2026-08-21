"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Peticion = { mensaje: string; accion: string; resolver: (ok: boolean) => void };

let abrir: ((p: Peticion) => void) | null = null;

/**
 * Sustituto de window.confirm(): devuelve una promesa que resuelve al pulsar.
 * Necesita <ConfirmHost/> montado (lo hace AppShell); sin host cae al confirm nativo.
 */
export function confirmar(mensaje: string, accion = "Borrar"): Promise<boolean> {
  if (!abrir) return Promise.resolve(window.confirm(mensaje));
  return new Promise((resolver) => abrir!({ mensaje, accion, resolver }));
}

export function ConfirmHost() {
  const [p, setP] = useState<Peticion | null>(null);

  useEffect(() => {
    abrir = setP;
    return () => {
      abrir = null;
    };
  }, []);

  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        p.resolver(false);
        setP(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [p]);

  if (!p) return null;
  const cerrar = (ok: boolean) => {
    p.resolver(ok);
    setP(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => cerrar(false)}>
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm">{p.mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => cerrar(false)}
            className="toque-estrecho rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]"
          >
            Cancelar
          </button>
          <button
            autoFocus
            onClick={() => cerrar(true)}
            className="toque-estrecho rounded-lg bg-[#ef4444] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#dc2626]"
          >
            {p.accion}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
