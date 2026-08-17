"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/trpc/react";
import { opsFor, type DbField, type Filter, type Sort } from "@/lib/viewData";

type View = { id: string; name: string; type: string; config: any };

const VIEW_TYPES: { type: "table" | "kanban" | "calendar" | "timeline" | "gallery" | "chart" | "list" | "form"; label: string; icon: string }[] = [
  { type: "table", label: "Tabla", icon: "▤" },
  { type: "kanban", label: "Kanban", icon: "▦" },
  { type: "list", label: "Lista", icon: "☰" },
  { type: "gallery", label: "Galería", icon: "🖼" },
  { type: "calendar", label: "Calendario", icon: "🗓" },
  { type: "timeline", label: "Cronograma", icon: "📊" },
  { type: "chart", label: "Gráfica", icon: "▧" },
  { type: "form", label: "Formulario", icon: "📝" },
];

function Popover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl">
      {children}
    </div>
  );
}

export function DbToolbar({
  pageId,
  collectionId,
  view,
  fields,
  onViewCreated,
  onViewDeleted,
}: {
  pageId: string;
  collectionId: string;
  view: View;
  fields: DbField[];
  onViewCreated: (id: string) => void;
  onViewDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState<null | "filter" | "sort" | "props" | "add" | "cfg">(null);
  const refresh = () => utils.db.get.invalidate({ pageId });

  const update = trpc.db.updateView.useMutation({ onSuccess: refresh });
  const addView = trpc.db.addView.useMutation({
    onSuccess: async (v) => {
      await refresh();
      onViewCreated(v.id);
      setOpen(null);
    },
  });
  const renameView = trpc.db.renameView.useMutation({ onSuccess: refresh });
  const setViewType = trpc.db.setViewType.useMutation({ onSuccess: async () => { await refresh(); setOpen(null); } });
  const deleteView = trpc.db.deleteView.useMutation({
    onSuccess: async () => {
      await refresh();
      onViewDeleted();
      setOpen(null);
    },
  });

  const filters: Filter[] = Array.isArray(view.config?.filters) ? view.config.filters : [];
  const sorts: Sort[] = Array.isArray(view.config?.sorts) ? view.config.sorts : [];
  const hidden: string[] = Array.isArray(view.config?.hiddenFields) ? view.config.hiddenFields : [];
  const saveConfig = (patch: any) => update.mutate({ id: view.id, config: { ...view.config, ...patch } });
  const toggleHidden = (id: string) =>
    saveConfig({ hiddenFields: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });

  const fieldById = (id: string) => fields.find((f) => f.id === id);

  return (
    <div className="flex items-center gap-1 text-sm">
      {/* Filtrar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "filter" ? null : "filter")}
          className={`rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${filters.length ? "text-brand" : "text-[var(--muted)]"}`}
        >
          ⧩ Filtrar{filters.length ? ` (${filters.length})` : ""}
        </button>
        {open === "filter" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Filtros</div>
            {filters.length === 0 && <p className="mb-2 text-xs text-[var(--muted)]">Sin filtros.</p>}
            <div className="space-y-2">
              {filters.map((f, i) => {
                const field = fieldById(f.fieldId);
                const ops = opsFor(field?.type ?? "text");
                return (
                  <div key={i} className="flex items-center gap-1">
                    <select
                      value={f.fieldId}
                      onChange={(e) => {
                        const nf = [...filters];
                        const nt = fieldById(e.target.value)?.type ?? "text";
                        nf[i] = { fieldId: e.target.value, op: opsFor(nt)[0].value, value: "" };
                        saveConfig({ filters: nf });
                      }}
                      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                    >
                      {fields.map((fl) => (
                        <option key={fl.id} value={fl.id}>{fl.name}</option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => {
                        const nf = [...filters];
                        nf[i] = { ...f, op: e.target.value };
                        saveConfig({ filters: nf });
                      }}
                      className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                    >
                      {ops.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <FilterValue
                      field={field}
                      value={f.value}
                      onChange={(v) => {
                        const nf = [...filters];
                        nf[i] = { ...f, value: v };
                        saveConfig({ filters: nf });
                      }}
                    />
                    <button
                      onClick={() => saveConfig({ filters: filters.filter((_, j) => j !== i) })}
                      className="shrink-0 px-1 text-[var(--muted)] hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                const fl = fields[0];
                if (!fl) return;
                saveConfig({ filters: [...filters, { fieldId: fl.id, op: opsFor(fl.type)[0].value, value: "" }] });
              }}
              className="mt-2 text-xs text-brand hover:underline"
            >
              + Añadir filtro
            </button>
          </Popover>
        )}
      </div>

      {/* Ordenar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "sort" ? null : "sort")}
          className={`rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${sorts.length ? "text-brand" : "text-[var(--muted)]"}`}
        >
          ↕ Ordenar{sorts.length ? ` (${sorts.length})` : ""}
        </button>
        {open === "sort" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Orden</div>
            {sorts.length === 0 && <p className="mb-2 text-xs text-[var(--muted)]">Sin orden.</p>}
            <div className="space-y-2">
              {sorts.map((so, i) => (
                <div key={i} className="flex items-center gap-1">
                  <select
                    value={so.fieldId}
                    onChange={(e) => {
                      const ns = [...sorts];
                      ns[i] = { ...so, fieldId: e.target.value };
                      saveConfig({ sorts: ns });
                    }}
                    className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                  >
                    {fields.map((fl) => (
                      <option key={fl.id} value={fl.id}>{fl.name}</option>
                    ))}
                  </select>
                  <select
                    value={so.dir}
                    onChange={(e) => {
                      const ns = [...sorts];
                      ns[i] = { ...so, dir: e.target.value as "asc" | "desc" };
                      saveConfig({ sorts: ns });
                    }}
                    className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
                  >
                    <option value="asc">A→Z ↑</option>
                    <option value="desc">Z→A ↓</option>
                  </select>
                  <button
                    onClick={() => saveConfig({ sorts: sorts.filter((_, j) => j !== i) })}
                    className="shrink-0 px-1 text-[var(--muted)] hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                const fl = fields[0];
                if (!fl) return;
                saveConfig({ sorts: [...sorts, { fieldId: fl.id, dir: "asc" }] });
              }}
              className="mt-2 text-xs text-brand hover:underline"
            >
              + Añadir orden
            </button>
          </Popover>
        )}
      </div>

      {/* Propiedades (mostrar/ocultar columnas) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "props" ? null : "props")}
          className={`rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${hidden.length ? "text-brand" : "text-[var(--muted)]"}`}
        >
          👁 Propiedades{hidden.length ? ` (${fields.length - hidden.length}/${fields.length})` : ""}
        </button>
        {open === "props" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Mostrar en esta vista</div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {fields.map((f) => {
                const visible = !hidden.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleHidden(f.id)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--border)]/40"
                  >
                    <span className={visible ? "" : "opacity-40"}>{f.name}</span>
                    <span className="ml-auto text-xs">{visible ? "👁" : "🚫"}</span>
                  </button>
                );
              })}
            </div>
          </Popover>
        )}
      </div>

      {/* Config vista (renombrar / borrar) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "cfg" ? null : "cfg")}
          className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--border)]/40"
          title="Ajustes de la vista"
        >
          ⚙
        </button>
        {open === "cfg" && (
          <Popover onClose={() => setOpen(null)}>
            <button
              onClick={() => {
                const name = window.prompt("Nuevo nombre de la vista:", view.name);
                if (name && name.trim()) renameView.mutate({ id: view.id, name: name.trim() });
                setOpen(null);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--border)]/40"
            >
              ✏️ Renombrar vista
            </button>
            <div className="my-1 border-t border-[var(--border)] pt-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Mostrar como</div>
              <div className="flex flex-wrap gap-1 px-1">
                {VIEW_TYPES.map((vt) => (
                  <button
                    key={vt.type}
                    onClick={() => setViewType.mutate({ id: view.id, type: vt.type })}
                    className={`rounded-md px-2 py-1 text-xs hover:bg-brand-50 ${view.type === vt.type ? "bg-brand-50 text-brand" : ""}`}
                    title={vt.label}
                  >
                    {vt.icon} {vt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la vista "${view.name}"?`)) deleteView.mutate({ id: view.id });
              }}
              className="mt-1 block w-full rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--border)]/40"
            >
              🗑 Borrar vista
            </button>
          </Popover>
        )}
      </div>

      {/* Añadir vista */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "add" ? null : "add")}
          className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
        >
          + Vista
        </button>
        {open === "add" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Nueva vista</div>
            {VIEW_TYPES.map((vt) => (
              <button
                key={vt.type}
                onClick={() => addView.mutate({ collectionId, type: vt.type })}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-brand-50"
              >
                {vt.icon} {vt.label}
              </button>
            ))}
          </Popover>
        )}
      </div>
    </div>
  );
}

function FilterValue({ field, value, onChange }: { field?: DbField; value: any; onChange: (v: any) => void }) {
  if (!field) return null;
  if (field.type === "checkbox") {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value === "true")} className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs">
        <option value="true">✓</option>
        <option value="false">✗</option>
      </select>
    );
  }
  if (field.type === "select" || field.type === "multiselect") {
    const opts: any[] = field.config?.options ?? [];
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs">
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }
  const inputType = field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text";
  return (
    <input
      type={inputType}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
    />
  );
}
