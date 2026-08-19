"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  ClipboardList,
  Columns3,
  Download,
  Eye,
  EyeOff,
  Filter as FilterIcon,
  GanttChart,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Settings,
  Table,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "@/trpc/react";
import { downloadText } from "@/lib/download";
import {
  countFilters,
  isFilterGroup,
  NO_VALUE_OPS,
  opsFor,
  type DbField,
  type Filter,
  type FilterNode,
  type Sort,
} from "@/lib/viewData";

type View = { id: string; name: string; type: string; config: any };

const VIEW_TYPES: { type: "table" | "kanban" | "calendar" | "timeline" | "gallery" | "chart" | "list" | "form"; label: string; icon: typeof Table }[] = [
  { type: "table", label: "Tabla", icon: Table },
  { type: "kanban", label: "Kanban", icon: Columns3 },
  { type: "list", label: "Lista", icon: List },
  { type: "gallery", label: "Galería", icon: LayoutGrid },
  { type: "calendar", label: "Calendario", icon: Calendar },
  { type: "timeline", label: "Cronograma", icon: GanttChart },
  { type: "chart", label: "Gráfica", icon: BarChart3 },
  { type: "form", label: "Formulario", icon: ClipboardList },
];

/** Icono lucide del tipo de vista (Tabla por defecto). */
export function ViewIcon({ type, size = 14 }: { type: string; size?: number }) {
  const I = VIEW_TYPES.find((v) => v.type === type)?.icon ?? Table;
  return <I size={size} />;
}

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

  const filters: FilterNode[] = Array.isArray(view.config?.filters) ? view.config.filters : [];
  const nFilters = countFilters(filters);
  const filterOp: "and" | "or" = view.config?.filterOp === "or" ? "or" : "and";
  const sorts: Sort[] = Array.isArray(view.config?.sorts) ? view.config.sorts : [];
  const hidden: string[] = Array.isArray(view.config?.hiddenFields) ? view.config.hiddenFields : [];
  const saveConfig = (patch: any) => update.mutate({ id: view.id, config: { ...view.config, ...patch } });
  const toggleHidden = (id: string) =>
    saveConfig({ hiddenFields: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] });

  return (
    <div className="flex items-center gap-1 text-sm">
      {/* Filtrar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "filter" ? null : "filter")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${nFilters ? "text-brand" : "text-[var(--muted)]"}`}
        >
          <FilterIcon size={14} /> Filtrar{nFilters ? ` (${nFilters})` : ""}
        </button>
        {open === "filter" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-2 text-xs font-medium text-[var(--muted)]">Filtros</div>
            {filters.length >= 2 && (
              <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                <span>Coincidir con</span>
                <select
                  value={filterOp}
                  onChange={(e) => saveConfig({ filterOp: e.target.value })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--foreground)]"
                >
                  <option value="and">todos</option>
                  <option value="or">cualquiera</option>
                </select>
                <span>los filtros</span>
              </div>
            )}
            <FilterNodesEditor
              nodes={filters}
              onChange={(nf) => saveConfig({ filters: nf })}
              fields={fields}
              depth={0}
            />
          </Popover>
        )}
      </div>

      {/* Ordenar */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "sort" ? null : "sort")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${sorts.length ? "text-brand" : "text-[var(--muted)]"}`}
        >
          <ArrowUpDown size={14} /> Ordenar{sorts.length ? ` (${sorts.length})` : ""}
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
                    <X size={14} />
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
              className="mt-2 flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <Plus size={12} /> Añadir orden
            </button>
          </Popover>
        )}
      </div>

      {/* Propiedades (mostrar/ocultar columnas) */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "props" ? null : "props")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--border)]/40 ${hidden.length ? "text-brand" : "text-[var(--muted)]"}`}
        >
          <Eye size={14} /> Propiedades{hidden.length ? ` (${fields.length - hidden.length}/${fields.length})` : ""}
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
                    <span className="ml-auto text-[var(--muted)]">{visible ? <Eye size={14} /> : <EyeOff size={14} />}</span>
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
          <Settings size={16} />
        </button>
        {open === "cfg" && (
          <Popover onClose={() => setOpen(null)}>
            <button
              onClick={() => {
                const name = window.prompt("Nuevo nombre de la vista:", view.name);
                if (name && name.trim()) renameView.mutate({ id: view.id, name: name.trim() });
                setOpen(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--border)]/40"
            >
              <Pencil size={14} /> Renombrar vista
            </button>
            <div className="my-1 border-t border-[var(--border)] pt-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Mostrar como</div>
              <div className="flex flex-wrap gap-1 px-1">
                {VIEW_TYPES.map((vt) => (
                  <button
                    key={vt.type}
                    onClick={() => setViewType.mutate({ id: view.id, type: vt.type })}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-brand-50 ${view.type === vt.type ? "bg-brand-50 text-brand" : ""}`}
                    title={vt.label}
                  >
                    <vt.icon size={13} /> {vt.label}
                  </button>
                ))}
              </div>
            </div>
            {(view.type === "kanban" || view.type === "gallery") && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Tarjetas</div>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Tamaño de tarjeta</span>
                  <select
                    value={view.config?.cardSize ?? "medium"}
                    onChange={(e) => saveConfig({ cardSize: e.target.value })}
                    className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="small">Pequeño</option>
                    <option value="medium">Mediano</option>
                    <option value="large">Grande</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Vista previa</span>
                  <select
                    value={view.config?.cardPreview ?? "none"}
                    onChange={(e) => saveConfig({ cardPreview: e.target.value })}
                    className="max-w-[140px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="none">Ninguna</option>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la vista "${view.name}"?`)) deleteView.mutate({ id: view.id });
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--border)]/40"
            >
              <Trash2 size={14} /> Borrar vista
            </button>
          </Popover>
        )}
      </div>

      {/* Exportar CSV */}
      <button
        onClick={async () => {
          const { name, csv } = await utils.db.exportCsv.fetch({ collectionId });
          downloadText(`${name}.csv`, csv, "text/csv");
        }}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--border)]/40"
        title="Exportar CSV"
      >
        <Download size={14} /> CSV
      </button>

      {/* Añadir vista */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "add" ? null : "add")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
        >
          <Plus size={14} /> Vista
        </button>
        {open === "add" && (
          <Popover onClose={() => setOpen(null)}>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Nueva vista</div>
            {VIEW_TYPES.map((vt) => (
              <button
                key={vt.type}
                onClick={() => addView.mutate({ collectionId, type: vt.type })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-brand-50"
              >
                <vt.icon size={14} /> {vt.label}
              </button>
            ))}
          </Popover>
        )}
      </div>
    </div>
  );
}

/** Editor recursivo de filtros: condiciones sueltas y grupos anidados and/or. */
function FilterNodesEditor({
  nodes,
  onChange,
  fields,
  depth,
}: {
  nodes: FilterNode[];
  onChange: (nodes: FilterNode[]) => void;
  fields: DbField[];
  depth: number;
}) {
  const set = (i: number, n: FilterNode) => onChange(nodes.map((x, j) => (j === i ? n : x)));
  const remove = (i: number) => onChange(nodes.filter((_, j) => j !== i));
  const newCondition = (): Filter | null => {
    const fl = fields[0];
    return fl ? { fieldId: fl.id, op: opsFor(fl.type)[0].value, value: "" } : null;
  };
  return (
    <div>
      {nodes.length === 0 && <p className="mb-2 text-xs text-[var(--muted)]">Sin filtros.</p>}
      <div className="space-y-2">
        {nodes.map((node, i) =>
          isFilterGroup(node) ? (
            <div
              key={i}
              className="rounded-md border border-[var(--border)] border-l-2 border-l-brand/60 p-2"
            >
              <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
                <span>Coincidir con</span>
                <select
                  value={node.op}
                  onChange={(e) => set(i, { ...node, op: e.target.value as "and" | "or" })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs text-[var(--foreground)]"
                >
                  <option value="and">todos</option>
                  <option value="or">cualquiera</option>
                </select>
                <button
                  onClick={() => remove(i)}
                  className="ml-auto shrink-0 px-1 text-[var(--muted)] hover:text-red-500"
                  title="Borrar grupo"
                >
                  <X size={14} />
                </button>
              </div>
              <FilterNodesEditor
                nodes={node.filters}
                onChange={(f) => set(i, { ...node, filters: f })}
                fields={fields}
                depth={depth + 1}
              />
            </div>
          ) : (
            <ConditionRow
              key={i}
              filter={node}
              fields={fields}
              onChange={(f) => set(i, f)}
              onRemove={() => remove(i)}
            />
          ),
        )}
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button
          onClick={() => {
            const c = newCondition();
            if (c) onChange([...nodes, c]);
          }}
          className="flex items-center gap-1 text-brand hover:underline"
        >
          <Plus size={12} /> Añadir filtro
        </button>
        {/* ponytail: anidación capada a 2 niveles por usabilidad del popover; sube el tope si hace falta */}
        {depth < 2 && (
          <button
            onClick={() => {
              const c = newCondition();
              onChange([...nodes, { type: "group", op: "and", filters: c ? [c] : [] }]);
            }}
            className="flex items-center gap-1 text-[var(--muted)] hover:text-brand hover:underline"
          >
            <Plus size={12} /> Añadir grupo
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  filter,
  fields,
  onChange,
  onRemove,
}: {
  filter: Filter;
  fields: DbField[];
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.id === filter.fieldId);
  const ops = opsFor(field?.type ?? "text");
  return (
    <div className="flex items-center gap-1">
      <select
        value={filter.fieldId}
        onChange={(e) => {
          const nt = fields.find((f) => f.id === e.target.value)?.type ?? "text";
          onChange({ fieldId: e.target.value, op: opsFor(nt)[0].value, value: "" });
        }}
        className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
      >
        {fields.map((fl) => (
          <option key={fl.id} value={fl.id}>{fl.name}</option>
        ))}
      </select>
      <select
        value={filter.op}
        onChange={(e) => onChange({ ...filter, op: e.target.value })}
        className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
      >
        {ops.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <FilterValue field={field} op={filter.op} value={filter.value} onChange={(v) => onChange({ ...filter, value: v })} />
      <button onClick={onRemove} className="shrink-0 px-1 text-[var(--muted)] hover:text-red-500">
        <X size={14} />
      </button>
    </div>
  );
}

function FilterValue({ field, op, value, onChange }: { field?: DbField; op: string; value: any; onChange: (v: any) => void }) {
  if (!field) return null;
  if (NO_VALUE_OPS.has(op)) return <span className="flex-1" />;
  if (field.type === "checkbox") {
    return (
      <select value={String(value)} onChange={(e) => onChange(e.target.value === "true")} className="rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs">
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    );
  }
  if (field.type === "person") return <PersonFilterValue value={value} onChange={onChange} />;
  if (field.type === "select" || field.type === "multiselect" || field.type === "status") {
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
  const inputType = field.type === "date" ? "date" : field.type === "number" ? "number" : "text";
  return (
    <input
      type={inputType}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
    />
  );
}

/** Valor de filtro para campos "Persona": desplegable de miembros del espacio. */
function PersonFilterValue({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const { data } = trpc.workspace.members.useQuery();
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1 py-1 text-xs"
    >
      <option value="">—</option>
      {(data?.members ?? []).map((m) => (
        <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
      ))}
    </select>
  );
}
