"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, BarChart3, Calendar, ClipboardList, Columns3, Copy, Download, Eye, EyeOff, Filter as FilterIcon, GanttChart, LayoutGrid, List, Pencil, Plus, Settings, Table, Trash2, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { downloadText } from "@/lib/download";
import { VIEW_MENU_EVENT } from "@/lib/shortcuts";
import {
  countFilters,
  isFilterGroup,
  type ColorRule,
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

/**
 * Menú colgante de un botón (filtros, opciones de columna, tipos de vista…).
 *
 * Se pinta FUERA del árbol de la página, pegado a su botón por coordenadas. Antes
 * colgaba del botón con posición absoluta y, dentro de la tabla —que se desplaza en
 * horizontal—, el menú quedaba recortado: el de «añadir columna» se veía a medias.
 * Al sacarlo del árbol ya no hay caja que lo recorte, y de paso se le pone tope de
 * altura y se le impide salirse de la pantalla.
 *
 * `className` sigue diciendo el ancho y hacia qué lado alinea (`right-0` = por la
 * derecha, que es como lo piden casi todos los botones de la barra).
 */
export function Popover({
  children,
  onClose,
  className = "right-0 w-80 p-3",
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ancla = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const porLaDerecha = className.includes("right-0");

  useLayoutEffect(() => {
    const colocar = () => {
      const boton = ancla.current?.parentElement?.getBoundingClientRect();
      const caja = panel.current?.getBoundingClientRect();
      if (!boton) return;
      const ancho = caja?.width || 320;
      const alto = caja?.height || 240;
      const margen = 8;
      const izq = porLaDerecha ? boton.right - ancho : boton.left;
      // Debajo del botón, que es donde se espera. Solo se va arriba si no cabe
      // debajo Y arriba hay más sitio: subirlo a un hueco aún más pequeño sería
      // cambiar un menú apretado por otro peor.
      const huecoAbajo = window.innerHeight - boton.bottom - margen;
      const huecoArriba = boton.top - margen;
      const debajo = alto <= huecoAbajo || huecoAbajo >= huecoArriba;
      setPos({
        top: debajo ? boton.bottom + 4 : Math.max(margen, boton.top - Math.min(alto, huecoArriba) - 4),
        left: Math.max(margen, Math.min(izq, window.innerWidth - ancho - margen)),
        maxHeight: debajo ? huecoAbajo : huecoArriba,
      });
    };
    colocar();
    // Si la página se mueve bajo el menú, el menú se mueve con ella.
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => {
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
    };
  }, [porLaDerecha]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as globalThis.Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  return (
    <>
      <span ref={ancla} className="hidden" />
      {createPortal(
        <div
          ref={panel}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight }}
          className={`fixed z-[60] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl ${className.replace(/\b(right|left)-0\b/g, "")}`}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
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
  const duplicateView = trpc.db.duplicateView.useMutation({
    onSuccess: async (v) => {
      await refresh();
      onViewCreated(v.id); // la copia queda seleccionada, como al crear una vista
      setOpen(null);
    },
  });
  const setViewType = trpc.db.setViewType.useMutation({ onSuccess: async () => { await refresh(); setOpen(null); } });
  const deleteView = trpc.db.deleteView.useMutation({
    onSuccess: async () => {
      await refresh();
      onViewDeleted();
      setOpen(null);
    },
  });

  // El clic derecho sobre la pestaña de una vista abre este mismo menú: la acción
  // viaja por un evento de ventana, como los atajos, para no tener que subir el
  // estado del menú hasta la tabla y volver a bajarlo.
  useEffect(() => {
    const abrir = () => setOpen("cfg");
    window.addEventListener(VIEW_MENU_EVENT, abrir);
    return () => window.removeEventListener(VIEW_MENU_EVENT, abrir);
  }, []);

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
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${nFilters ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title={nFilters ? `Filtrar (${nFilters})` : "Filtrar"}
          aria-label="Filtrar"
        >
          <FilterIcon size={15} />
          {!!nFilters && <span className="text-[11px] font-medium">{nFilters}</span>}
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
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${sorts.length ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title={sorts.length ? `Ordenar (${sorts.length})` : "Ordenar"}
          aria-label="Ordenar"
        >
          <ArrowUpDown size={15} />
          {!!sorts.length && <span className="text-[11px] font-medium">{sorts.length}</span>}
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
          className={`flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] ${hidden.length ? "text-brand" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          title="Propiedades: qué columnas se ven"
          aria-label="Propiedades"
        >
          <Eye size={15} />
          {!!hidden.length && (
            <span className="text-[11px] font-medium">{fields.length - hidden.length}</span>
          )}
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
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-[var(--hover)]"
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
          className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-[var(--hover)]"
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
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
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-[var(--hover)] ${view.type === vt.type ? "bg-[var(--active)] font-medium" : ""}`}
                    title={vt.label}
                  >
                    <vt.icon size={13} /> {vt.label}
                  </button>
                ))}
              </div>
            </div>
            {["table", "kanban", "list", "gallery"].includes(view.type) && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-[var(--muted)]">Agrupar</div>
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Agrupar por</span>
                  <select
                    value={view.config?.groupByFieldId ?? ""}
                    onChange={(e) => saveConfig({ groupByFieldId: e.target.value || null })}
                    className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    {/* El Kanban necesita columnas sí o sí: sin campo elige el primero de Selección/Estado. */}
                    <option value="">{view.type === "kanban" ? "Automático" : "Sin agrupar"}</option>
                    {fields
                      .filter((f) =>
                        view.type === "kanban"
                          ? ["select", "status", "person", "checkbox"].includes(f.type)
                          : !["rollup", "formula", "relation", "files", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(
                              f.type,
                            ),
                      )
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                  </select>
                </label>
                {/* Segundo nivel, solo en la Tabla y solo si ya se agrupa por algo. */}
                {view.type === "table" && view.config?.groupByFieldId && (
                  <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                    <span>Y después por</span>
                    <select
                      value={view.config?.subGroupByFieldId ?? ""}
                      onChange={(e) => saveConfig({ subGroupByFieldId: e.target.value || null })}
                      className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="">Sin subagrupar</option>
                      {fields
                        .filter(
                          (f) =>
                            f.id !== view.config?.groupByFieldId &&
                            !["rollup", "formula", "relation", "files", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(
                              f.type,
                            ),
                        )
                        .map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {view.type === "table" && (
              <label className="my-1 flex items-center justify-between gap-2 border-t border-[var(--border)] px-2 pt-2 text-sm">
                <span>Envolver texto</span>
                <input
                  type="checkbox"
                  checked={Boolean(view.config?.wrapText)}
                  onChange={(e) => saveConfig({ wrapText: e.target.checked })}
                  className="size-4 accent-[var(--color-brand,#ff5c28)]"
                />
              </label>
            )}
            {(view.type === "table" || view.type === "gallery") && (
              <div className="my-1 border-t border-[var(--border)] pt-1">
                <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                  <span>Color por</span>
                  <select
                    value={view.config?.rowColorFieldId ?? ""}
                    onChange={(e) => saveConfig({ rowColorFieldId: e.target.value || null })}
                    className="max-w-[150px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                  >
                    <option value="">Sin color</option>
                    {fields
                      .filter((f) => f.type === "select" || f.type === "status" || f.type === "multiselect")
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                  </select>
                </label>
                <ColorRulesEditor
                  fields={fields}
                  rules={view.config?.colorRules ?? []}
                  onChange={(colorRules) => saveConfig({ colorRules })}
                />
              </div>
            )}
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
              onClick={() => duplicateView.mutate({ id: view.id })}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <Copy size={14} /> Duplicar vista
            </button>
            <button
              onClick={() => {
                if (window.confirm(`¿Borrar la vista "${view.name}"?`)) deleteView.mutate({ id: view.id });
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--hover)]"
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
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        title="Exportar a CSV"
        aria-label="Exportar a CSV"
      >
        <Download size={15} />
      </button>

    </div>
  );
}

/**
 * Botón «+» de añadir vista. Va pegado a las pestañas, que es donde se busca, y por
 * eso no necesita decir «Vista»: se entiende por dónde está. Antes vivía al final de
 * la barra de acciones, lejos de lo que crea.
 */
export function AddViewButton({
  pageId,
  collectionId,
  onViewCreated,
}: {
  pageId: string;
  collectionId: string;
  onViewCreated: (id: string) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const addView = trpc.db.addView.useMutation({
    onSuccess: async (v) => {
      await utils.db.get.invalidate({ pageId });
      onViewCreated(v.id);
      setOpen(false);
    },
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
        title="Añadir una vista"
        aria-label="Añadir una vista"
      >
        <Plus size={15} />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <div className="mb-1 text-xs font-medium text-[var(--muted)]">Nueva vista</div>
          {VIEW_TYPES.map((vt) => (
            <button
              key={vt.type}
              onClick={() => addView.mutate({ collectionId, type: vt.type })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--hover)]"
            >
              <vt.icon size={14} /> {vt.label}
            </button>
          ))}
        </Popover>
      )}
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
            className="flex items-center gap-1 text-[var(--muted)] hover:text-[var(--foreground)] hover:underline"
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

const RULE_COLORS: [string, string][] = [
  ["red", "Rojo"],
  ["orange", "Naranja"],
  ["yellow", "Amarillo"],
  ["green", "Verde"],
  ["blue", "Azul"],
  ["gray", "Gris"],
];

/**
 * Reglas de color: cada una tiene sus condiciones (el mismo editor que los filtros
 * de la vista) y un color. Gana la primera que cumple la fila.
 */
function ColorRulesEditor({
  fields,
  rules,
  onChange,
}: {
  fields: DbField[];
  rules: ColorRule[];
  onChange: (rules: ColorRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (i: number, rule: ColorRule) => onChange(rules.map((r, j) => (j === i ? rule : r)));

  return (
    <div className="px-2 pb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-1 text-sm hover:text-[var(--foreground)]"
      >
        <span>Reglas de color</span>
        <span className="text-xs text-[var(--muted)]">{rules.length || "ninguna"}</span>
      </button>
      {open && (
        <div className="space-y-2 pb-1">
          {rules.map((rule, i) => (
            <div key={rule.id} className="rounded-lg border border-[var(--border)] p-2">
              <div className="mb-1 flex items-center gap-2">
                <select
                  value={rule.color}
                  onChange={(e) => set(i, { ...rule, color: e.target.value })}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                >
                  {RULE_COLORS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <span className="text-xs text-[var(--muted)]">si cumple:</span>
                <button
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                  className="ml-auto text-[var(--muted)] hover:text-red-500"
                  title="Quitar regla"
                >
                  <X size={13} />
                </button>
              </div>
              <FilterNodesEditor
                nodes={rule.filters ?? []}
                fields={fields}
                onChange={(filters) => set(i, { ...rule, filters })}
                depth={1}
              />
            </div>
          ))}
          <button
            onClick={() =>
              onChange([
                ...rules,
                { id: "rule_" + Math.random().toString(36).slice(2, 9), color: "red", filters: [] },
              ])
            }
            className="text-xs text-brand hover:underline"
          >
            ＋ Añadir regla
          </button>
        </div>
      )}
    </div>
  );
}
