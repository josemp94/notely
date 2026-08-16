"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/trpc/react";

type Option = { id: string; label: string; color?: string };
export type FieldLite = { id: string; name: string; type: string; config: unknown };

const COLORS: Record<string, string> = {
  gray: "#e5e0d8",
  orange: "#ffd9c9",
  green: "#c9efd8",
  red: "#ffd2cd",
  blue: "#cfe0ff",
  yellow: "#fbeec2",
};

export function optionsOf(field: FieldLite): Option[] {
  const cfg = field.config as { options?: Option[] } | null;
  return cfg?.options ?? [];
}

export function Cell({
  field,
  value,
  onCommit,
  rollupValue,
  createdAt,
  updatedAt,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
  rollupValue?: string | number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}) {
  // Auto (solo lectura): fecha de creación / última edición
  if (field.type === "created_time" || field.type === "last_edited_time") {
    const src = field.type === "created_time" ? createdAt : updatedAt;
    const d = src ? new Date(src) : null;
    const txt =
      d && !isNaN(d.getTime())
        ? d.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "—";
    return <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">{txt}</span>;
  }

  if (field.type === "rollup" || field.type === "formula") {
    const v = rollupValue;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {v === undefined || v === null || v === "" ? "—" : String(v)}
      </span>
    );
  }

  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {n ? `${n} vinculado${n > 1 ? "s" : ""}` : "—"}
      </span>
    );
  }

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onCommit(e.target.checked)}
        className="size-4 accent-[var(--color-brand,#ff5c28)]"
      />
    );
  }

  if (field.type === "select" || field.type === "status" || field.type === "multiselect") {
    return <TagCell field={field} value={value} onCommit={onCommit} />;
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        defaultValue={typeof value === "string" ? value : ""}
        onBlur={(e) => onCommit(e.target.value || null)}
        className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    );
  }

  // url / email / phone: input con tipo adecuado + enlace clicable si hay valor
  if (field.type === "url" || field.type === "email" || field.type === "phone") {
    const raw = value == null ? "" : String(value);
    const href =
      field.type === "email" ? `mailto:${raw}` : field.type === "phone" ? `tel:${raw}` : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return (
      <div className="flex w-full items-center gap-1">
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "url"}
          defaultValue={raw}
          onBlur={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        {raw && (
          <a href={href} target="_blank" rel="noreferrer" className="shrink-0 px-1 text-xs text-brand hover:underline" title="Abrir">
            ↗
          </a>
        )}
      </div>
    );
  }

  // text / number (no controlado; commit al salir)
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      defaultValue={value == null ? "" : String(value)}
      onBlur={(e) => {
        const raw = e.target.value;
        if (field.type === "number") onCommit(raw === "" ? null : Number(raw));
        else onCommit(raw === "" ? null : raw);
      }}
      className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}

const OPTION_COLORS = ["gray", "orange", "green", "blue", "red", "yellow"];

function TagCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const utils = trpc.useUtils();
  const updateField = trpc.db.updateField.useMutation({ onSuccess: () => utils.db.get.invalidate() });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const multi = field.type === "multiselect";
  const opts = optionsOf(field);
  const selected: string[] = multi
    ? (Array.isArray(value) ? (value as string[]) : [])
    : value
      ? [String(value)]
      : [];

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const commit = (ids: string[]) => onCommit(multi ? ids : (ids[0] ?? null));

  const toggle = (id: string) => {
    if (multi) commit(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    else {
      commit(selected.includes(id) ? [] : [id]);
      setOpen(false);
    }
  };

  const addOption = () => {
    const label = q.trim();
    if (!label) return;
    const existing = opts.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      toggle(existing.id);
      setQ("");
      return;
    }
    const id = "opt_" + Math.random().toString(36).slice(2, 9);
    const color = OPTION_COLORS[opts.length % OPTION_COLORS.length];
    const cfg = (field.config as { options?: Option[] }) ?? {};
    updateField.mutate({ id: field.id, config: { ...cfg, options: [...opts, { id, label, color }] } });
    commit(multi ? [...selected, id] : [id]);
    setQ("");
    if (!multi) setOpen(false);
  };

  const pill = (o: Option) => (
    <span key={o.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ background: COLORS[o.color ?? "gray"] }}>
      {o.label}
      {multi && (
        <button onClick={(e) => { e.stopPropagation(); toggle(o.id); }} className="opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );

  const shown = q ? opts.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : opts;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {selected.length ? (
          selected.map((id) => {
            const o = opts.find((x) => x.id === id);
            return o ? pill(o) : null;
          })
        ) : (
          <span className="text-sm text-[var(--muted)]">—</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 shadow-xl">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOption()}
            placeholder="Buscar o crear…"
            className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o.id}
                onClick={() => toggle(o.id)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--border)]/40"
              >
                <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: COLORS[o.color ?? "gray"] }}>
                  {o.label}
                </span>
                {selected.includes(o.id) && <span className="ml-auto text-brand">✓</span>}
              </button>
            ))}
            {q && !opts.some((o) => o.label.toLowerCase() === q.toLowerCase()) && (
              <button onClick={addOption} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm text-brand hover:bg-brand-50">
                + Crear «{q}»
              </button>
            )}
            {shown.length === 0 && !q && <p className="px-1 py-1 text-xs text-[var(--muted)]">Sin opciones. Escribe para crear.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
