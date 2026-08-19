"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Maximize2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/trpc/react";
import { Cell, usePeople } from "./Cell";
import { formatNumber, groupBy, NUMBER_FORMATS, type FieldLite } from "@/lib/cellText";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { Popover } from "./DbToolbar";
import { RelationCell } from "./RelationCell";
import { RecordPanel } from "./RecordPanel";

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
}: {
  pageId: string;
  collectionId: string;
  fields: FieldLite[];
  records: Rec[];
  view: { id: string; config: unknown };
}) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.db.get.invalidate({ pageId });

  const updateCell = trpc.db.updateCell.useMutation({ onSuccess: invalidate });
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const addSubRecord = trpc.db.addSubRecord.useMutation({ onSuccess: invalidate });
  const deleteRecord = trpc.db.deleteRecord.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.db.deleteField.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [menuField, setMenuField] = useState<string | null>(null);
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

  // Agrupar en secciones plegables. Como en Notion, agrupar aplana la jerarquía de
  // subtareas: cada fila cae en el grupo de su propio valor, sin sangría.
  const groupField = fields.find((f) => f.id === cfg.groupByFieldId);
  const groups = groupBy(records, groupField, people);
  const hasCalcs = fields.some((f) => calcs[f.id]);

  /** Una fila de la tabla; `depth`/`hasChildren` solo se usan sin agrupar (árbol de subtareas). */
  const renderRow = ({ rec: r, depth, hasChildren }: { rec: Rec; depth: number; hasChildren: boolean }) => (
    <tr key={r.id} className="group border-b border-[var(--border)] hover:bg-[var(--border)]/20">
      <td className="px-1 py-1 text-center">
        <button
          onClick={() => setOpenRec(r)}
          className="text-[var(--muted)] opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
          title="Abrir ficha"
        >
          <Maximize2 size={14} />
        </button>
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
        if (i !== 0) return <td key={f.id} className="px-2 py-1">{cell}</td>;
        return (
          <td key={f.id} className="px-2 py-1">
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
            onClick={() => deleteRecord.mutate({ id: r.id })}
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
            <th className="w-8" />
            {fields.map((f) => (
              <th key={f.id} className="group relative min-w-40 px-2 py-1 font-medium">
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
                {menuField === f.id && (
                  <FieldMenu
                    field={f}
                    onClose={() => setMenuField(null)}
                    onRename={() => { setMenuField(null); setEditingField(f.id); }}
                    onConfig={(config) => updateField.mutate({ id: f.id, config: { ...(f.config as object), ...config } })}
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
            <td />
            {fields.map((f) => (
              <td key={f.id} className="px-2 py-1">
                <CalcCell field={f} calc={calcs[f.id] ?? ""} records={records} onChange={(c) => setCalc(f.id, c)} />
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>

      <button
        onClick={() => addRecord.mutate({ collectionId })}
        className="mt-2 px-2 py-1 text-sm text-[var(--muted)] hover:text-brand"
      >
        + Nueva fila
      </button>
      <div className="mt-1 px-2 text-xs text-[var(--muted)]">{rows.length} de {records.length} filas</div>

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


/** Menú ⋯ de una columna: renombrar, ajustes propios del tipo y borrar. */
function FieldMenu({
  field,
  onClose,
  onRename,
  onConfig,
  onDelete,
}: {
  field: FieldLite;
  onClose: () => void;
  onRename: () => void;
  onConfig: (config: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const cfg = (field.config as { prefix?: string; format?: string; max?: number } | null) ?? {};
  const item = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--border)]/40";
  return (
    <Popover onClose={onClose} className="left-0 w-64 p-2 font-normal normal-case">
      <button onClick={onRename} className={item}>
        Renombrar
      </button>

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
