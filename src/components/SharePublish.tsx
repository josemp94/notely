"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { trpc } from "@/trpc/react";

/** Botón de cabecera con popover Publicar/Despublicar y URL pública copiable. */
export function ShareButton({ pageId, publicToken }: { pageId: string; publicToken: string | null }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const invalidate = () => utils.pages.get.invalidate({ id: pageId });
  const publish = trpc.pages.publish.useMutation({ onSuccess: invalidate });
  const unpublish = trpc.pages.unpublish.useMutation({ onSuccess: invalidate });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // `open` solo puede ser true tras interacción (post-montaje), así que window existe.
  const url = open && publicToken ? `${window.location.origin}/s/${publicToken}` : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)] ${
          publicToken ? "text-brand" : "text-[var(--muted)]"
        }`}
        title="Compartir / Publicar en la web"
      >
        <Globe size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Publicar en la web</div>
              <div className="text-xs text-[var(--muted)]">
                {publicToken ? "Cualquiera con el enlace puede verla." : "Crea un enlace público de solo lectura."}
              </div>
            </div>
            <button
              onClick={() =>
                publicToken ? unpublish.mutate({ id: pageId }) : publish.mutate({ id: pageId })
              }
              disabled={publish.isPending || unpublish.isPending}
              role="switch"
              aria-checked={!!publicToken}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                publicToken ? "bg-brand" : "bg-[var(--border)]"
              }`}
              title={publicToken ? "Despublicar" : "Publicar"}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                  publicToken ? "left-4.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {url && (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:border-brand"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                {copied ? (
                  <>
                    Copiado <Check size={12} />
                  </>
                ) : (
                  "Copiar"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
