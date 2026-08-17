"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { Cell, type FieldLite } from "./Cell";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { RelationCell } from "./RelationCell";
import { RecordPanel } from "./RecordPanel";

type Rec = {
  id: string;
  cells: Record<string, unknown>;
  order: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
  const deleteRecord = trpc.db.deleteRecord.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.db.deleteField.useMutation({ onSuccess: invalidate });
  const updateField = trpc.db.updateField.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });
  const { data: computed } = trpc.db.computed.useQuery({ pageId });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  // El filtrado y el orden se aplican en Database (barra de herramientas superior).
  const rows = records;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (view.config ?? {}) as any;
  const calcs: Record<string, string> = cfg.calcs ?? {};
  const setCalc = (fieldId: string, calc: string) =>
    updateView.mutate({ id: view.id, config: { ...cfg, calcs: { ...calcs, [fieldId]: calc } } });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-left text-[var(--muted)]">
            <th className="w-8" />
            {fields.map((f) => (
              <th key={f.id} className="group min-w-40 px-2 py-1 font-medium">
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
                    onClick={() => {
                      if (confirm(`¿Borrar la columna "${f.name}"?`)) deleteField.mutate({ id: f.id });
                    }}
                    className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    title="Borrar columna"
                  >
                    ✕
                  </button>
                </span>
              </th>
            ))}
            <th className="px-2 py-1">
              <AddFieldButton collectionId={collectionId} fields={fields} onDone={invalidate} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group border-b border-[var(--border)] hover:bg-[var(--border)]/20">
              <td className="px-1 py-1 text-center">
                <button
                  onClick={() => setOpenRec(r)}
                  className="text-[var(--muted)] opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
                  title="Abrir ficha"
                >
                  ⤢
                </button>
              </td>
              {fields.map((f) => (
                <td key={f.id} className="px-2 py-1">
                  {f.type === "relation" ? (
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
                      onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
                    />
                  )}
                </td>
              ))}
              <td className="px-2 py-1">
                <button
                  onClick={() => deleteRecord.mutate({ id: r.id })}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="Borrar fila"
                >
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
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
          return <RecordPanel pageId={pageId} record={fresh} fields={fields} onClose={() => setOpenRec(null)} />;
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
      return nums.length ? String(round2(nums.reduce((a, b) => a + b, 0))) : "—";
    case "avg":
      return nums.length ? String(round2(nums.reduce((a, b) => a + b, 0) / nums.length)) : "—";
    case "min":
      return nums.length ? String(Math.min(...nums)) : "—";
    case "max":
      return nums.length ? String(Math.max(...nums)) : "—";
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
