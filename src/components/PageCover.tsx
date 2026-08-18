"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

/** Presets de gradiente; se guardan como "gradient:<id>". Imágenes: "url:<https…>". */
const GRADIENTS: Record<string, string> = {
  sunset: "linear-gradient(135deg, #ff5c28, #ffb347)",
  ocean: "linear-gradient(135deg, #2193b0, #6dd5ed)",
  berry: "linear-gradient(135deg, #642b73, #c6426e)",
  forest: "linear-gradient(135deg, #134e5e, #71b280)",
  candy: "linear-gradient(135deg, #ff9a9e, #fad0c4)",
  night: "linear-gradient(135deg, #232526, #414345)",
  gold: "linear-gradient(135deg, #f7971e, #ffd200)",
  lavender: "linear-gradient(135deg, #a18cd1, #fbc2eb)",
};

export function coverStyle(cover: string): React.CSSProperties {
  if (cover.startsWith("url:")) {
    return {
      backgroundImage: `url(${cover.slice(4)})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: GRADIENTS[cover.replace(/^gradient:/, "")] ?? GRADIENTS.sunset };
}

function CoverPicker({
  onPick,
  onClose,
  align,
}: {
  onPick: (cover: string) => void;
  onClose: () => void;
  align: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute top-full z-30 mt-1 w-72 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="mb-2 text-xs font-medium text-[var(--muted)]">Gradientes</div>
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(GRADIENTS).map(([id, css]) => (
          <button
            key={id}
            onClick={() => onPick(`gradient:${id}`)}
            title={id}
            className="h-10 rounded-md border border-[var(--border)] transition-transform hover:scale-105"
            style={{ background: css }}
          />
        ))}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <div className="mb-1 text-xs font-medium text-[var(--muted)]">Imagen por URL</div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onPick(`url:${url.trim()}`);
          }}
          placeholder="https://… y Enter"
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}

/** Banda de portada (ancho completo) con acciones al pasar el ratón. */
export function CoverBand({
  cover,
  onChange,
  editable,
}: {
  cover: string;
  onChange: (cover: string | null) => void;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group/cover relative h-40 w-full" style={coverStyle(cover)}>
      {editable && (
        <div
          className={`absolute bottom-2 right-4 flex gap-1 transition-opacity group-hover/cover:opacity-100 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
            >
              Cambiar portada
            </button>
            {open && (
              <CoverPicker
                align="right"
                onPick={(c) => {
                  onChange(c);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
              />
            )}
          </div>
          <button
            onClick={() => onChange(null)}
            className="rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
          >
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}

/** Botón "Añadir portada" para la cabecera (visible al pasar el ratón, como "Añadir icono"). */
export function AddCoverButton({ onChange }: { onChange: (cover: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--muted)] transition-opacity hover:bg-[var(--border)]/40 hover:text-[var(--foreground)] group-hover/header:opacity-100 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
        <ImageIcon size={16} /> Añadir portada
      </button>
      {open && (
        <CoverPicker
          align="left"
          onPick={(c) => {
            onChange(c);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
