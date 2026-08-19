"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Copy, GripVertical, Maximize2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Cell, usePeople } from "./Cell";
import { formatNumber, groupBy, NUMBER_FORMATS, rowColor, type FieldLite } from "@/lib/cellText";
import { colorByRules, type DbField, type DbRecord } from "@/lib/viewData";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { Popover } from "./DbToolbar";
import { RelationCell } from "./RelationCell";
import { RecordPanel } from "./RecordPanel";

export type RowTemplate = { id: string; name: string; cells: Record<string, unknown> };

type Rec = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  parentId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdById?: string | null;
  updatedById?: string | null;
  seq?: number;
};

export function TableView({
  pageId,
  collectionId,
  fields,
  records,
  view,
  templates = [],
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  view: { id: string; config: unknown };
  templates?: RowTemplate[];
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });

  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const addSubRecord = trpc.db.addSubRecord.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({ onSuccess: invalidate });
  const restoreRecord = trpc.db.restoreRecord.useMutation({
    onSuccess: () => {
      setDeleted(null);
      invalidate();
    },
  });
  const duplicateRecord = trpc.db.duplicateRecord.useMutation({ onSuccess: invalidate });
  const moveRecord = trpc.db.moveRecord.useMutation({ onSuccess: invalidate });
  const deleteTemplate = trpc.db.deleteTemplate.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.db.deleteField.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });
  const setFieldType = trpc.db.setFieldType.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [menuField, setMenuField] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  // Borrar una fila es reversible: se guarda cuál fue para poder deshacerlo.
  const [deleted, setDeleted] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  // Ancho de columna: se arrastra en local y se guarda en la vista al soltar.
  const [drag, setDrag] = useState<{ fieldId: string; startX: number; startW: number; w: number } | null>(null);
  // Arrastre de filas: solo con el orden natural (sin orden ni agrupación activos).
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropRow, setDropRow] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  // El filtrado y el orden se aplican en Database (barra de herramientas superior).
  // Sub-elementos: los hijos se agrupan indentados bajo su padre si el padre pasa el
  // filtro; si no, se muestran a nivel raíz. El plegado vive solo en el cliente.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set());
  const people = usePeople();
  const idSet = new Set(records.map((r) => r.id));
  const byParent = new Map<string, Rec[]>();
  for (const r of records) {
    const key = r.parentId && idSet.has(r.parentId) ? r.parentId : "";
    byParent.set(key, [...(byParent.get(key) ?? []), r]);
  }
  const rows: { rec: Rec; depth: number; hasChildren: boolean }[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      const hasChildren = byParent.has(r.id);
      rows.push({ rec: r, depth, hasChildren });
      if (hasChildren && !collapsed.has(r.id)) walk(r.id, depth + 1);
    }
  };
  walk("", 0);
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const addSub = (parentRecordId: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      next.delete(parentRecordId);
      return next;
    });
    addSubRecord.mutate({ parentRecordId });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (view.config ?? {}) as any;
  const calcs: Record<string, string> = cfg.calcs ?? {};
  const setCalc = (fieldId: string, calc: string) =>
    updateView.mutate({ id: view.id, config: { ...cfg, calcs: { ...calcs, [fieldId]: calc } } });

  const widths: Record<string, number> = cfg.widths ?? {};

  const widthOf = (fieldId: string) =>
    drag?.fieldId === fieldId ? drag.w : widths[fieldId];

  // El arrastre se sigue en window para que no se pierda al salir de la cabecera.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag({ ...d, w: Math.max(80, Math.round(d.startW + (e.clientX - d.startX))) });
    };
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d) updateView.mutate({ id: view.id, config: { ...cfg, widths: { ...widths, [d.fieldId]: d.w } } });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // Solo debe re-suscribirse al empezar o terminar el arrastre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.fieldId]);

  // Agrupar en secciones plegables. Como en Notion, agrupar aplana la jerarquía de
  // subtareas: cada fila cae en el grupo de su propio valor, sin sangría.
  const groupField = fields.find((f) => f.id === cfg.groupByFieldId);
  const canReorder = !groupField && !(cfg.sorts?.length > 0);
  const colorField = fields.find((f) => f.id === cfg.rowColorFieldId);
  // Primero las reglas («si vence hoy, en rojo»); si ninguna casa, el color de la etiqueta.
  const colorOf = (r: Rec) =>
    colorByRules(r as unknown as DbRecord, fields as unknown as DbField[], cfg.colorRules) ??
    rowColor(colorField, r.cells);
  const groups = groupBy(records, groupField, people);
  const hasCalcs = fields.some((f) => calcs[f.id]);

  /** Una fila de la tabla; `depth`/`hasChildren` solo se usan sin agrupar (árbol de subtareas). */
  const renderRow = ({ rec: r, depth, hasChildren }: { rec: Rec; depth: number; hasChildren: boolean }) => (
    <tr
      key={r.id}
      style={colorOf(r) ? { background: colorOf(r) } : undefined}
      className={`group border-b border-[var(--border)] hover:bg-[var(--border)]/20 ${
        dropRow?.id === r.id
          ? dropRow.pos === "before"
            ? "border-t-2 border-t-brand"
            : "border-b-2 border-b-brand"
          : ""
      }`}
      onDragOver={(e) => {
        if (!canReorder || !dragRow || dragRow === r.id) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropRow({ id: r.id, pos: e.clientY - rect.top < rect.height / 2 ? "before" : "after" });
      }}
      onDragLeave={() => setDropRow((d) => (d?.id === r.id ? null : d))}
      onDrop={(e) => {
        e.preventDefault();
        const target = dropRow;
        setDropRow(null);
        if (!canReorder || !dragRow || !target || dragRow === target.id) return;
        moveRecord.mutate(
          target.pos === "before" ? { id: dragRow, beforeId: target.id } : { id: dragRow, afterId: target.id },
        );
        setDragRow(null);
      }}
    >
      <td
        className="sticky left-0 z-10 px-1 py-1 text-center"
        style={{ background: colorOf(r) ?? "var(--background)" }}
      >
        <div className="flex items-center">
          {canReorder && (
            <span
              draggable
              onDragStart={(e) => {
                setDragRow(r.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragRow(null);
                setDropRow(null);
              }}
              className="cursor-grab text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100"
              title="Arrastra para reordenar"
            >
              <GripVertical size={13} />
            </span>
          )}
          <button
            onClick={() => setOpenRec(r)}
            className="text-[var(--muted)] opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
            title="Abrir ficha"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </td>
      {fields.map((f, i) => {
        const cell =
          f.type === "relation" ? (
            <RelationCell
              field={f}
              value={r.cells?.[f.id]}
              onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
            />
          ) : f.type === "rollup" || f.type === "formula" ? (
            <Cell field={f} value={null} rollupValue={computed?.rollups?.[r.id]?.[f.id]} onCommit={() => {}} />
          ) : (
            <Cell
              field={f}
              value={r.cells?.[f.id]}
              createdAt={r.createdAt}
              updatedAt={r.updatedAt}
              createdById={r.createdById}
              updatedById={r.updatedById}
              seq={r.seq}
              onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
            />
          );
        const w = widthOf(f.id);
        const style = w ? { maxWidth: w, width: w } : undefined;
        if (i !== 0)
          return (
            <td key={f.id} className="overflow-hidden px-2 py-1" style={style}>
              {cell}
            </td>
          );
        // Primera columna: congelada al desplazar en horizontal, con el color de la fila si lo hay.
        return (
          <td
            key={f.id}
            className="sticky left-14 z-10 overflow-hidden px-2 py-1"
            style={{ ...style, background: colorOf(r) ?? "var(--background)" }}
          >
            <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
              {hasChildren ? (
                <button
                  onClick={() => toggle(r.id)}
                  className="flex w-4 shrink-0 items-center justify-center text-[var(--muted)] hover:text-brand"
                  title={collapsed.has(r.id) ? "Expandir subtareas" : "Plegar subtareas"}
                >
                  {collapsed.has(r.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">{cell}</div>
            </div>
          </td>
        );
      })}
      <td className="whitespace-nowrap px-2 py-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => addSub(r.id)}
            className="text-[var(--muted)] opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
            title="Añadir subtarea"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              deleteRecord.mutate({ id: r.id });
              setDeleted(r.id);
            }}
            className="text-[var(--muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
            title="Borrar fila"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            <th className="sticky left-0 z-20 w-14 bg-[var(--background)]" />
            {fields.map((f, i) => (
              <th
                key={f.id}
                className={`group relative px-2 py-1 font-medium ${widthOf(f.id) ? "" : "min-w-40"} ${
                  i === 0 ? "sticky left-14 z-20 bg-[var(--background)]" : ""
                }`}
                style={widthOf(f.id) ? { width: widthOf(f.id), minWidth: widthOf(f.id), maxWidth: widthOf(f.id) } : undefined}
              >
                <span className="flex items-center gap-1">
                  {editingField === f.id ? (
                    <input
                      autoFocus
                      defaultValue={f.name}
                      onBlur={(e) => {
                        updateField.mutate({ id: f.id, name: e.target.value || f.name });
                        setEditingField(null);
                      }}
                      className="w-28 rounded border border-[var(--border)] px-1"
                    />
                  ) : (
                    <button onDoubleClick={() => setEditingField(f.id)} className="truncate">
                      {f.name}
                    </button>
                  )}
                  <span className="text-[10px] uppercase opacity-50">{FIELD_LABELS[f.type] ?? f.type}</span>
                  <button
                    onClick={() => setMenuField(menuField === f.id ? null : f.id)}
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    title="Opciones de la columna"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </span>
                {/* Tirador para ajustar el ancho (doble clic vuelve al automático). */}
                <span
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const th = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setDrag({ fieldId: f.id, startX: e.clientX, startW: th.width, w: th.width });
                  }}
                  onDoubleClick={() => {
                    const next = { ...widths };
                    delete next[f.id];
                    updateView.mutate({ id: view.id, config: { ...cfg, widths: next } });
                  }}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-brand/40 group-hover:opacity-100"
                  title="Arrastra para ajustar el ancho"
                />
                {menuField === f.id && (
                  <FieldMenu
                    field={f}
                    onClose={() => setMenuField(null)}
                    onRename={() => { setMenuField(null); setEditingField(f.id); }}
                    onConfig={(config) => updateField.mutate({ id: f.id, config: { ...(f.config as object), ...config } })}
                    onType={(type) => {
                      if (confirm(`Cambiar «${f.name}» a ${FIELD_LABELS[type] ?? type}. Los valores se convertirán y lo que no se pueda convertir se perderá. ¿Seguir?`)) {
                        setFieldType.mutate({ id: f.id, type });
                        setMenuField(null);
                      }
                    }}
                    onDelete={() => {
                      if (confirm(`¿Borrar la columna "${f.name}"?`)) deleteField.mutate({ id: f.id });
                      setMenuField(null);
                    }}
                  />
                )}
              </th>
            ))}
            <th className="px-2 py-1">
              <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
            </th>
          </tr>
        </thead>
        {groupField ? (
          groups.map((g) => {
            const folded = foldedGroups.has(g.key);
            return (
              <tbody key={g.key}>
                <tr className="border-b border-[var(--border)] bg-[var(--border)]/20">
                  <td colSpan={fields.length + 2} className="px-1 py-1">
                    <button
                      onClick={() =>
                        setFoldedGroups((s) => {
                          const next = new Set(s);
                          if (next.has(g.key)) next.delete(g.key);
                          else next.add(g.key);
                          return next;
                        })
                      }
                      className="flex items-center gap-1 text-sm font-medium hover:text-brand"
                    >
                      {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {g.label}
                      <span className="text-xs font-normal text-[var(--muted)]">{g.records.length}</span>
                    </button>
                  </td>
                </tr>
                {!folded && g.records.map((r) => renderRow({ rec: r, depth: 0, hasChildren: false }))}
                {!folded && hasCalcs && (
                  <tr className="border-b border-[var(--border)] text-xs text-[var(--muted)]">
                    <td />
                    {fields.map((f) => (
                      <td key={f.id} className="px-2 py-1 text-right tabular-nums">
                        {calcs[f.id] ? computeCalc(calcs[f.id], f, g.records) : ""}
                      </td>
                    ))}
                    <td />
                  </tr>
                )}
              </tbody>
            );
          })
        ) : (
        <tbody>{rows.map(renderRow)}</tbody>
        )}
        <tfoot>
          <tr className="border-t border-[var(--border)] text-xs text-[var(--muted)]">
            <td className="sticky left-0 z-10 bg-[var(--background)]" />
            {fields.map((f, i) => (
              <td key={f.id} className={`px-2 py-1 ${i === 0 ? "sticky left-14 z-10 bg-[var(--background)]" : ""}`}>
                <CalcCell field={f} calc={calcs[f.id] ?? ""} records={records} onChange={(c) => setCalc(f.id, c)} />
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="relative mt-2 flex items-center">
        <button
          onClick={() => addRecord.mutate({ collectionId })}
          className="px-2 py-1 text-sm text-[var(--muted)] hover:text-brand"
        >
          + Nueva fila
        </button>
        {templates.length > 0 && (
          <button
            onClick={() => setNewMenu((o) => !o)}
            className="rounded px-1 py-1 text-[var(--muted)] hover:text-brand"
            title="Crear desde una plantilla"
          >
            <ChevronDown size={14} />
          </button>
        )}
        {newMenu && (
          <div className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl">
            {templates.map((t) => (
              <div key={t.id} className="group/tpl flex items-center">
                <button
                  onClick={() => {
                    addRecord.mutate({ collectionId, cells: t.cells });
                    setNewMenu(false);
                  }}
                  className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--border)]/40"
                >
                  {t.name}
                </button>
                <button
                  onClick={() => deleteTemplate.mutate({ collectionId, templateId: t.id })}
                  className="px-1 text-[var(--muted)] opacity-0 hover:text-red-500 group-hover/tpl:opacity-100"
                  title="Borrar plantilla"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 px-2 text-xs text-[var(--muted)]">
        <span>{rows.length} de {records.length} filas</span>
        <button onClick={() => setTrashOpen(true)} className="flex items-center gap-1 hover:text-brand">
          <Trash2 size={12} /> Papelera
        </button>
      </div>
      {trashOpen && <RecordTrash collectionId={collectionId} onClose={() => setTrashOpen(false)} onChange={invalidate} />}

      {deleted && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm shadow-xl">
          <span>Fila borrada</span>
          <button
            onClick={() => restoreRecord.mutate({ id: deleted })}
            className="font-medium text-brand hover:underline"
          >
            Deshacer
          </button>
          <button onClick={() => setDeleted(null)} className="text-[var(--muted)] hover:text-[var(--foreground)]" title="Cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      {openRec &&
        (() => {
          const fresh = records.find((r) => r.id === openRec.id) ?? openRec;
          return <RecordPanel pageId={pageId} collectionId={collectionId} record={fresh} fields={fields} onClose={() => setOpenRec(null)} />;
        })()}
    </div>
  );
}

const CALC_OPTS: [string, string][] = [
  ["", "Calcular"],
  ["count", "Contar todo"],
  ["filled", "No vacías"],
  ["empty", "Vacías"],
  ["percent_filled", "% no vacías"],
  ["sum", "Suma"],
  ["avg", "Media"],
  ["min", "Mín"],
  ["max", "Máx"],
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeCalc(calc: string, field: FieldLite, records: Rec[]): string {
  if (!calc) return "";
  const vals = records.map((r) => r.cells?.[field.id]);
  const nonEmpty = vals.filter(
    (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  const nums = nonEmpty.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  // Los cálculos de un campo Número se muestran con su formato (€, %, miles).
  const num = (n: number) => (field.type === "number" ? formatNumber(n, field) : String(round2(n)));
  switch (calc) {
    case "count":
      return String(records.length);
    case "filled":
      return String(nonEmpty.length);
    case "empty":
      return String(records.length - nonEmpty.length);
    case "percent_filled":
      return records.length ? Math.round((nonEmpty.length / records.length) * 100) + "%" : "0%";
    case "sum":
      return nums.length ? num(round2(nums.reduce((a, b) => a + b, 0))) : "—";
    case "avg":
      return nums.length ? num(round2(nums.reduce((a, b) => a + b, 0) / nums.length)) : "—";
    case "min":
      return nums.length ? num(Math.min(...nums)) : "—";
    case "max":
      return nums.length ? num(Math.max(...nums)) : "—";
    default:
      return "";
  }
}

function CalcCell({
  field,
  calc,
  records,
  onChange,
}: {
  field: FieldLite;
  calc: string;
  records: Rec[];
  onChange: (c: string) => void;
}) {
  const val = computeCalc(calc, field, records);
  const label = CALC_OPTS.find((o) => o[0] === calc)?.[1] ?? "Calcular";
  return (
    <div className="group/calc flex items-center justify-end gap-1">
      {calc && (
        <span className="tabular-nums">
          {label}: <b className="text-[var(--foreground)]">{val}</b>
        </span>
      )}
      <select
        value={calc}
        onChange={(e) => onChange(e.target.value)}
        className={`cursor-pointer rounded bg-transparent text-xs outline-none ${calc ? "opacity-0 group-hover/calc:opacity-100" : "opacity-40 group-hover/calc:opacity-100"}`}
        title="Calcular"
      >
        {CALC_OPTS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}


/** Tipos a los que se puede convertir una columna (los que guardan su valor en la celda). */
const CONVERTIBLE_TYPES = [
  "text", "number", "select", "multiselect", "status", "person", "files", "checkbox",
  "date", "url", "email", "phone", "created_time", "last_edited_time", "created_by", "last_edited_by", "id",
] as const;
type ConvertibleType = (typeof CONVERTIBLE_TYPES)[number];

/** Menú ⋯ de una columna: renombrar, ajustes propios del tipo y borrar. */
function FieldMenu({
  field,
  onClose,
  onRename,
  onConfig,
  onType,
  onDelete,
}: {
  field: FieldLite;
  onClose: () => void;
  onRename: () => void;
  onConfig: (config: Record<string, unknown>) => void;
  onType: (type: ConvertibleType) => void;
  onDelete: () => void;
}) {
  const cfg = (field.config as { prefix?: string; format?: string; max?: number; time?: boolean; range?: boolean } | null) ?? {};
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--border)]/40";
  return (
    <Popover onClose={onClose} className="left-0 w-64 p-2 font-normal normal-case">
      <button onClick={onRename} className={item}>
        Renombrar
      </button>

      {/* Los campos calculados no se pueden convertir: su valor no vive en la celda. */}
      {!["relation", "rollup", "formula"].includes(field.type) && (
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span>Tipo</span>
          <select
            value={field.type}
            onChange={(e) => onType(e.target.value as ConvertibleType)}
            className="max-w-[140px] rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
          >
            {CONVERTIBLE_TYPES.map((t) => (
              <option key={t} value={t}>{FIELD_LABELS[t] ?? t}</option>
            ))}
          </select>
        </label>
      )}

      {field.type === "id" && (
        <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span>Prefijo</span>
          <input
            defaultValue={cfg.prefix ?? ""}
            placeholder="TAREA-"
            onBlur={(e) => onConfig({ prefix: e.target.value })}
            className="w-24 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
          />
        </label>
      )}

      {field.type === "date" && (
        <>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Incluir hora</span>
            <input
              type="checkbox"
              defaultChecked={Boolean(cfg.time)}
              onChange={(e) => onConfig({ time: e.target.checked })}
              className="size-4 accent-[var(--color-brand,#ff5c28)]"
            />
          </label>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Rango de fechas</span>
            <input
              type="checkbox"
              defaultChecked={Boolean(cfg.range)}
              onChange={(e) => onConfig({ range: e.target.checked })}
              className="size-4 accent-[var(--color-brand,#ff5c28)]"
            />
          </label>
        </>
      )}

      {field.type === "number" && (
        <>
          <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Formato</span>
            <select
              value={cfg.format ?? "plain"}
              onChange={(e) => onConfig({ format: e.target.value })}
              className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
            >
              {NUMBER_FORMATS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          {cfg.format === "bar" && (
            <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
              <span>Máximo de la barra</span>
              <input
                type="number"
                defaultValue={cfg.max ?? 100}
                onBlur={(e) => onConfig({ max: Number(e.target.value) || 100 })}
                className="w-20 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
              />
            </label>
          )}
        </>
      )}

      <button onClick={onDelete} className={`${item} text-red-500`}>
        <Trash2 size={14} /> Borrar columna
      </button>
    </Popover>
  );
}

/** Papelera de filas: lo borrado en los últimos 30 días, para restaurar o rematar. */
function RecordTrash({
  collectionId,
  onClose,
  onChange,
}: {
  collectionId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.db.archivedRecords.useQuery({ collectionId });
  const refresh = () => {
    utils.db.archivedRecords.invalidate({ collectionId });
    onChange();
  };
  const restore = trpc.db.restoreRecord.useMutation({ onSuccess: refresh });
  const purge = trpc.db.purgeRecord.useMutation({ onSuccess: refresh });

  // Purga perezosa al abrir, como la papelera de páginas.
  const purgeExpired = trpc.db.purgeExpiredRecords.useMutation({
    onSuccess: (r) => {
      if (r.purged > 0) refresh();
    },
    onError: () => {},
  });
  const purgeExpiredMutate = purgeExpired.mutate;
  useEffect(() => purgeExpiredMutate({ collectionId }), [purgeExpiredMutate, collectionId]);

  const daysLeft = (archivedAt: string | Date) =>
    Math.max(1, Math.ceil(30 - (Date.now() - new Date(archivedAt).getTime()) / 864e5));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display font-bold">Papelera de filas</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        {isLoading && <p className="py-6 text-center text-sm text-[var(--muted)]">Cargando…</p>}
        {!isLoading && !items?.length && (
          <p className="py-6 text-center text-sm text-[var(--muted)]">No has borrado ninguna fila.</p>
        )}
        <ul className="divide-y divide-[var(--border)]">
          {(items ?? []).map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {it.title}
                {it.isSubtask && <span className="ml-1 text-xs text-[var(--muted)]">(subtarea)</span>}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">se borra en {daysLeft(it.archivedAt)} días</span>
              <button onClick={() => restore.mutate({ id: it.id })} className="shrink-0 text-brand hover:underline">
                Restaurar
              </button>
              <button
                onClick={() => {
                  if (confirm(`¿Borrar «${it.title}» para siempre?`)) purge.mutate({ id: it.id });
                }}
                className="shrink-0 text-[var(--muted)] hover:text-red-500"
                title="Borrar para siempre"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
