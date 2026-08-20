"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Paperclip, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Popover } from "./Popover";
import { dateValue, formatNumber, OPTION_COLORS, optionsOf, STATUS_GROUPS, type Attachment, type FieldLite, type Option } from "@/lib/cellText";


/** Mapa userId -> nombre de los miembros del espacio (para pintar campos "person"). */
export function usePeople(): Map<string, string> {
  const { data } = trpc.workspace.members.useQuery();
  return useMemo(
    () => new Map((data?.members ?? []).map((m) => [m.userId, m.name || m.email])),
    [data],
  );
}


export function Cell({
  field,
  value,
  onCommit,
  rollupValue,
  createdAt,
  updatedAt,
  createdById,
  updatedById,
  seq,
  wrap = false,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
  rollupValue?: string | number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
  /** La vista pide envolver el texto largo en vez de recortarlo. */
  wrap?: boolean;
}) {
  // ID incremental (solo lectura), con prefijo opcional
  if (field.type === "id") {
    const prefix = (field.config as { prefix?: string })?.prefix ?? "";
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {seq == null ? "—" : `${prefix}${seq}`}
      </span>
    );
  }

  // Auto (solo lectura): quién creó o editó la fila
  if (field.type === "created_by" || field.type === "last_edited_by") {
    return <AuthorCell userId={field.type === "created_by" ? createdById : updatedById} />;
  }

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

  if (field.type === "person") {
    return <PersonCell value={value} onCommit={onCommit} />;
  }

  if (field.type === "files") {
    return <FilesCell value={value} onCommit={onCommit} />;
  }

  if (field.type === "select" || field.type === "status" || field.type === "multiselect") {
    return <TagCell field={field} value={value} onCommit={onCommit} />;
  }

  if (field.type === "date") {
    return <DateCell field={field} value={value} onCommit={onCommit} />;
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
          <a href={href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center px-1 text-brand hover:underline" title="Abrir">
            <ArrowUpRight size={14} />
          </a>
        )}
      </div>
    );
  }

  if (field.type === "number") {
    return <NumberCell field={field} value={value} onCommit={onCommit} />;
  }

  // text (no controlado; commit al salir)
  if (wrap) return <WrappedTextCell value={value} onCommit={onCommit} />;
  return (
    <input
      type="text"
      defaultValue={value == null ? "" : String(value)}
      onBlur={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
      className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}

/**
 * Celda de texto con el contenido envuelto en varias líneas (opción «Envolver
 * texto» de la vista). Crece con lo escrito en vez de recortar.
 */
function WrappedTextCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajustar = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => ajustar(ref.current), [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      defaultValue={value == null ? "" : String(value)}
      onInput={(e) => ajustar(e.currentTarget)}
      onBlur={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
      className="w-full resize-none bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}

/**
 * Campo Número: muestra el valor con su formato (1.234,5 · € · % · barra) y, al
 * enfocarlo, el número crudo para poder editarlo.
 */
function NumberCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const cfg = (field.config as { format?: string; max?: number } | null) ?? {};
  const raw = value == null ? "" : String(value);
  const n = Number(value);
  const max = Number(cfg.max) > 0 ? Number(cfg.max) : 100;

  return (
    <div className="w-full">
      <input
        type="text"
        inputMode="decimal"
        key={raw}
        defaultValue={formatNumber(value, field)}
        onFocus={(e) => (e.target.value = raw)}
        onBlur={(e) => {
          const text = e.target.value.trim().replace(/[€%\s.]/g, "").replace(",", ".");
          const next = text === "" ? null : Number(text);
          e.target.value = formatNumber(next, field);
          onCommit(next === null || Number.isNaN(next) ? null : next);
        }}
        className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {cfg.format === "bar" && Number.isFinite(n) && (
        <div className="mx-1 mb-0.5 h-1 rounded-full bg-[var(--border)]">
          <div
            className="h-1 rounded-full bg-brand"
            style={{ width: `${Math.max(0, Math.min(100, (n / max) * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

const COLOR_NAMES = ["gray", "orange", "green", "blue", "red", "yellow"];

function TagCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const utils = trpc.useUtils();
  const updateField = trpc.db.updateField.useMutation({ onSuccess: () => utils.db.get.invalidate() });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const multi = field.type === "multiselect";
  const isStatus = field.type === "status";
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

  const setGroup = (optionId: string, group: string) => {
    const cfg = (field.config as { options?: Option[] }) ?? {};
    updateField.mutate({
      id: field.id,
      config: { ...cfg, options: opts.map((o) => (o.id === optionId ? { ...o, group } : o)) },
    });
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
    const color = COLOR_NAMES[opts.length % COLOR_NAMES.length];
    const cfg = (field.config as { options?: Option[] }) ?? {};
    const option: Option = isStatus ? { id, label, color, group: "todo" } : { id, label, color };
    updateField.mutate({ id: field.id, config: { ...cfg, options: [...opts, option] } });
    commit(multi ? [...selected, id] : [id]);
    setQ("");
    if (!multi) setOpen(false);
  };

  const pill = (o: Option) => (
    <span key={o.id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs" style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "#26241f" }}>
      {o.label}
      {multi && (
        <button onClick={(e) => { e.stopPropagation(); toggle(o.id); }} className="opacity-60 hover:opacity-100">
          <X size={12} />
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
        <Popover onClose={() => setOpen(false)} className="left-0 w-56 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOption()}
            placeholder="Buscar o crear…"
            className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {/* El campo Estado separa sus opciones en Por hacer / En curso / Hecho, como Notion. */}
            {(isStatus ? STATUS_GROUPS : [["", ""] as [string, string]]).map(([group, groupLabel]) => {
              const inGroup = isStatus ? shown.filter((o) => (o.group ?? "todo") === group) : shown;
              if (isStatus && !inGroup.length) return null;
              return (
                <div key={group}>
                  {isStatus && (
                    <div className="px-1 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                      {groupLabel}
                    </div>
                  )}
                  {inGroup.map((o) => (
                    <div key={o.id} className="group/opt flex items-center gap-1 rounded hover:bg-[var(--hover)]">
                      <button onClick={() => toggle(o.id)} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-sm">
                        <span className="truncate rounded px-1.5 py-0.5 text-xs" style={{ background: OPTION_COLORS[o.color ?? "gray"], color: "#26241f" }}>
                          {o.label}
                        </span>
                        {selected.includes(o.id) && <span className="ml-auto text-brand"><Check size={14} /></span>}
                      </button>
                      {isStatus && (
                        <select
                          value={o.group ?? "todo"}
                          onChange={(e) => setGroup(o.id, e.target.value)}
                          className="shrink-0 cursor-pointer bg-transparent text-[10px] text-[var(--muted)] opacity-0 outline-none group-hover/opt:opacity-100"
                          title="Mover a otro grupo"
                        >
                          {STATUS_GROUPS.map(([g, l]) => (
                            <option key={g} value={g}>{l}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {q && !opts.some((o) => o.label.toLowerCase() === q.toLowerCase()) && (
              <button onClick={addOption} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm text-brand hover:bg-[var(--hover)]">
                + Crear «{q}»
              </button>
            )}
            {shown.length === 0 && !q && <p className="px-1 py-1 text-xs text-[var(--muted)]">Sin opciones. Escribe para crear.</p>}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** Iniciales para el avatar: "Jose Monreal" -> "JM"; "jose@x.com" -> "J". */
export function initialsOf(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function Avatar({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand"
      style={{ width: size, height: size }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Campo "Persona": varios miembros del espacio, como en Notion. Valor = userId[]. */
function PersonCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data } = trpc.workspace.members.useQuery(undefined, { enabled: open });
  const selected: string[] = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];

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

  const members = data?.members ?? [];
  const nameOf = (userId: string) => {
    const m = members.find((x) => x.userId === userId);
    return m ? m.name || m.email : userId;
  };
  const toggle = (userId: string) =>
    onCommit(selected.includes(userId) ? selected.filter((x) => x !== userId) : [...selected, userId]);
  const shown = q
    ? members.filter((m) => (m.name || m.email).toLowerCase().includes(q.toLowerCase()))
    : members;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-[var(--border)]/30"
      >
        {selected.length ? (
          selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--border)]/40 py-0.5 pl-0.5 pr-2 text-xs">
              <Avatar name={nameOf(id)} />
              {nameOf(id)}
            </span>
          ))
        ) : (
          <span className="text-sm text-[var(--muted)]">—</span>
        )}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="left-0 w-60 p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar persona…"
            className="mb-2 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {shown.map((m) => (
              <button
                key={m.userId}
                onClick={() => toggle(m.userId)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--hover)]"
              >
                <Avatar name={m.name || m.email} />
                <span className="min-w-0 flex-1 truncate">{m.name || m.email}</span>
                {selected.includes(m.userId) && <span className="text-brand"><Check size={14} /></span>}
              </button>
            ))}
            {!shown.length && <p className="px-1 py-1 text-xs text-[var(--muted)]">Sin miembros que coincidan.</p>}
          </div>
        </Popover>
      )}
    </div>
  );
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB (mismo límite que /api/upload)

/** Campo "Archivos y multimedia": adjuntos subidos a /api/upload. Valor = Attachment[]. */
function FilesCell({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: Attachment[] = Array.isArray(value) ? (value as Attachment[]) : [];

  const upload = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setError(null);
    setBusy(true);
    const added: Attachment[] = [];
    try {
      for (const file of Array.from(picked)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`«${file.name}» supera los 8 MB.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "No se pudo subir el archivo.");
          continue;
        }
        added.push({ id: data.id, url: data.url, name: data.name ?? file.name, mime: data.mime ?? file.type });
      }
      if (added.length) onCommit([...files, ...added]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Quitar solo desengancha el adjunto de la celda: el Asset puede quedar huérfano, como las portadas.
  const remove = (id: string) => onCommit(files.filter((f) => f.id !== id));

  return (
    <div className="flex min-h-[26px] w-full flex-wrap items-center gap-1 px-1 py-0.5">
      {files.map((f) => (
        <span key={f.id} className="inline-flex max-w-[12rem] items-center gap-1 rounded bg-[var(--border)]/40 px-1.5 py-0.5 text-xs">
          {f.mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.url} alt="" className="size-4 shrink-0 rounded object-cover" />
          ) : (
            <Paperclip size={12} className="shrink-0" />
          )}
          <a href={f.url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={f.name ?? "archivo"}>
            {f.name || "archivo"}
          </a>
          <button onClick={() => remove(f.id)} className="shrink-0 opacity-60 hover:opacity-100" title="Quitar">
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded px-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)] disabled:opacity-60"
      >
        {busy ? "Subiendo…" : files.length ? "+" : "+ Adjuntar"}
      </button>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      {error && <span className="w-full text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

/** Campo "Creado por" / "Editado por": solo lectura, resuelto contra los miembros del espacio. */
function AuthorCell({ userId }: { userId?: string | null }) {
  const people = usePeople();
  const name = userId ? (people.get(userId) ?? "Desconocido") : null;
  return (
    <span className="flex items-center gap-1 px-1 py-0.5 text-sm text-[var(--muted)]">
      {name ? (
        <>
          <Avatar name={name} />
          {name}
        </>
      ) : (
        "—"
      )}
    </span>
  );
}

/**
 * Campo Fecha. Según su configuración: día suelto, con hora (`time`) o rango
 * (`range`, que guarda { start, end } en vez de una cadena).
 */
function DateCell({ field, value, onCommit }: { field: FieldLite; value: unknown; onCommit: (v: unknown) => void }) {
  const cfg = (field.config as { time?: boolean; range?: boolean } | null) ?? {};
  const d = dateValue(value);
  const type = cfg.time ? "datetime-local" : "date";
  // Sin hora, el input date no admite la parte "T…": se recorta.
  const cut = (iso?: string) => (iso ? (cfg.time ? iso.slice(0, 16) : iso.slice(0, 10)) : "");

  const commit = (start: string, end: string) => {
    if (!start) return onCommit(null);
    if (!cfg.range) return onCommit(start);
    onCommit(end ? { start, end } : { start });
  };

  return (
    <div className="flex w-full items-center gap-1">
      <input
        type={type}
        value={cut(d?.start)}
        onChange={(e) => commit(e.target.value, cut(d?.end))}
        className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      {cfg.range && (
        <>
          <span className="shrink-0 text-xs text-[var(--muted)]">→</span>
          <input
            type={type}
            value={cut(d?.end)}
            onChange={(e) => commit(cut(d?.start), e.target.value)}
            className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        </>
      )}
    </div>
  );
}
