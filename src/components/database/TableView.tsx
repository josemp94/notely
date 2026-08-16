"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/trpc/react";
import { Cell, optionsOf, type FieldLite } from "./Cell";
import { FIELD_LABELS, AddFieldButton } from "./shared";
import { RecordPanel } from "./RecordPanel";

type Rec = { id: string; cells: Record<string, unknown>; order: string };
type Filter = { fieldId: string; op: string; value: string };
type Sort = { fieldId: string; dir: "asc" | "desc" };
type TableConfig = { filter?: Filter; sort?: Sort };

const OPS: [string, string][] = [
  ["contains", "contiene"],
  ["eq", "="],
  ["gt", ">"],
  ["lt", "<"],
];

function matches(cellRaw: unknown, op: string, value: string): boolean {
  if (value === "") return true;
  const cell = cellRaw == null ? "" : String(cellRaw);
  const nA = Number(cell);
  const nB = Number(value);
  switch (op) {
    case "eq":
      return cell.toLowerCase() === value.toLowerCase();
    case "gt":
      return Number.isFinite(nA) && Number.isFinite(nB) ? nA > nB : cell > value;
    case "lt":
      return Number.isFinite(nA) && Number.isFinite(nB) ? nA < nB : cell < value;
    default:
      return cell.toLowerCase().includes(value.toLowerCase());
  }
}

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

  const [editingField, setEditingField] = useState<string | null>(null);
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  const cfg = (view.config ?? {}) as TableConfig;
  const saveCfg = (patch: Partial<TableConfig>) =>
    updateView.mutate({ id: view.id, config: { ...cfg, ...patch } });

  // Etiqueta legible de una celda (para ordenar/filtrar select por su label)
  const cellText = (f: FieldLite, val: unknown): string => {
    if (f.type === "select") return optionsOf(f).find((o) => o.id === val)?.label ?? "";
    return val == null ? "" : String(val);
  };

  const rows = useMemo(() => {
    let out = records;
    if (cfg.filter?.fieldId) {
      const f = fields.find((x) => x.id === cfg.filter!.fieldId);
      if (f) out = out.filter((r) => matches(cellText(f, r.cells?.[f.id]) || r.cells?.[f.id], cfg.filter!.op, cfg.filter!.value));
    }
    if (cfg.sort?.fieldId) {
      const f = fields.find((x) => x.id === cfg.sort!.fieldId);
      if (f) {
        const dir = cfg.sort.dir === "desc" ? -1 : 1;
        out = [...out].sort((a, b) => {
          const va = cellText(f, a.cells?.[f.id]);
          const vb = cellText(f, b.cells?.[f.id]);
          const na = Number(va), nb = Number(vb);
          if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
          return va.localeCompare(vb) * dir;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, JSON.stringify(cfg), fields]);

  return (
    <div className="overflow-x-auto">
      {/* Barra de filtro y orden */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
        <span>Filtro:</span>
        <FieldSelect fields={fields} value={cfg.filter?.fieldId ?? ""} onChange={(v) => saveCfg({ filter: v ? { fieldId: v, op: cfg.filter?.op ?? "contains", value: cfg.filter?.value ?? "" } : undefined })} />
        {cfg.filter?.fieldId && (
          <>
            <select value={cfg.filter.op} onChange={(e) => saveCfg({ filter: { ...cfg.filter!, op: e.target.value } })} className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-1">
              {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input defaultValue={cfg.filter.value} onBlur={(e) => saveCfg({ filter: { ...cfg.filter!, value: e.target.value } })} placeholder="valor" className="w-28 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1" />
          </>
        )}
        <span className="ml-3">Orden:</span>
        <FieldSelect fields={fields} value={cfg.sort?.fieldId ?? ""} onChange={(v) => saveCfg({ sort: v ? { fieldId: v, dir: cfg.sort?.dir ?? "asc" } : undefined })} />
        {cfg.sort?.fieldId && (
          <select value={cfg.sort.dir} onChange={(e) => saveCfg({ sort: { ...cfg.sort!, dir: e.target.value as "asc" | "desc" } })} className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-1">
            <option value="asc">↑ Asc</option>
            <option value="desc">↓ Desc</option>
          </select>
        )}
      </div>

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
              <AddFieldButton collectionId={collectionId} onDone={invalidate} />
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
                  <Cell
                    field={f}
                    value={r.cells?.[f.id]}
                    onCommit={(value) => updateCell.mutate({ recordId: r.id, fieldId: f.id, value })}
                  />
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

function FieldSelect({
  fields,
  value,
  onChange,
}: {
  fields: FieldLite[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)]">
      <option value="">—</option>
      {fields.map((f) => (
        <option key={f.id} value={f.id}>{f.name}</option>
      ))}
    </select>
  );
}
