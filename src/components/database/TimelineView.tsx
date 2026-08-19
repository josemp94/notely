"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import type { FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_W = 34;

function parseDay(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

export function TimelineView({
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
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });

  const dateFields = fields.filter((f) => f.type === "date");
  const cfg = (view.config ?? {}) as { dateFieldId?: string; endFieldId?: string };
  const startFieldId = cfg.dateFieldId ?? dateFields[0]?.id ?? null;
  const endFieldId = cfg.endFieldId ?? null;
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];

  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const monthStart = new Date(cursor.y, cursor.m, 1);
  const monthEnd = new Date(cursor.y, cursor.m, daysInMonth);

  const bars = useMemo(() => {
    if (!startFieldId) return [];
    const out: { rec: Rec; startDay: number; span: number }[] = [];
    for (const r of records) {
      const s = parseDay(r.cells?.[startFieldId]);
      if (!s) continue;
      const e = endFieldId ? parseDay(r.cells?.[endFieldId]) ?? s : s;
      // ¿solapa el mes visible?
      if (e < monthStart || s > monthEnd) continue;
      const clampS = s < monthStart ? monthStart : s;
      const clampE = e > monthEnd ? monthEnd : e;
      const startDay = clampS.getDate();
      const span = Math.max(1, clampE.getDate() - startDay + 1);
      out.push({ rec: r, startDay, span });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, startFieldId, endFieldId, cursor.y, cursor.m]);

  if (!startFieldId) {
    return (
      <div className="py-10 text-[var(--muted)]">
        Esta base de datos no tiene ningún campo de fecha. Añade uno para usar el cronograma.
      </div>
    );
  }

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };
  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => setCursor({ y: today.getFullYear(), m: today.getMonth() });
  const isToday = (day: number) =>
    today.getFullYear() === cursor.y && today.getMonth() === cursor.m && today.getDate() === day;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const gridW = daysInMonth * DAY_W;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={prev} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <span className="font-display min-w-[9rem] text-center text-lg font-bold">{MONTHS[cursor.m]} {cursor.y}</span>
        <button onClick={next} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
        <button onClick={goToday} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--border)]/30">Hoy</button>

        <div className="ml-auto flex items-center gap-2">
          {dateFields.length > 1 && (
            <select
              value={startFieldId}
              onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, dateFieldId: e.target.value } })}
              className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
            >
              {dateFields.map((f) => <option key={f.id} value={f.id}>Inicio: {f.name}</option>)}
            </select>
          )}
          {dateFields.length > 1 && (
            <select
              value={endFieldId ?? ""}
              onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, endFieldId: e.target.value || undefined } })}
              className="rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
            >
              <option value="">Fin: (1 día)</option>
              {dateFields.filter((f) => f.id !== startFieldId).map((f) => <option key={f.id} value={f.id}>Fin: {f.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div style={{ width: 180 + gridW }}>
          {/* Cabecera de días */}
          <div className="flex border-b border-[var(--border)] bg-[var(--background)]">
            <div className="w-[180px] shrink-0 px-2 py-1.5 text-xs font-medium text-[var(--muted)]">Registro</div>
            <div className="flex">
              {days.map((d) => (
                <div
                  key={d}
                  className={`shrink-0 border-l border-[var(--border)] py-1.5 text-center text-[10px] ${isToday(d) ? "font-bold text-brand" : "text-[var(--muted)]"}`}
                  style={{ width: DAY_W }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>

          {/* Filas */}
          {bars.length === 0 && (
            <div className="px-3 py-6 text-sm text-[var(--muted)]">Sin registros con fecha en {MONTHS[cursor.m]}.</div>
          )}
          {bars.map(({ rec, startDay, span }) => (
            <div key={rec.id} className="flex items-center border-b border-[var(--border)] last:border-0 hover:bg-[var(--border)]/15">
              <div className="w-[180px] shrink-0 truncate px-2 py-2 text-sm" title={recTitle(rec)}>
                {recTitle(rec)}
              </div>
              <div className="relative py-2" style={{ width: gridW }}>
                <button
                  onClick={() => setOpenRec(rec)}
                  className="absolute top-1/2 h-5 -translate-y-1/2 truncate rounded bg-brand/85 px-2 text-left text-[11px] text-white hover:bg-brand"
                  style={{ left: (startDay - 1) * DAY_W + 2, width: span * DAY_W - 4 }}
                  title={recTitle(rec)}
                >
                  {recTitle(rec)}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {openRec && (
        <RecordPanel pageId={pageId} record={openRec} fields={fields} onClose={() => setOpenRec(null)} />
      )}
    </div>
  );
}
