"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/trpc/react";
import { RecordPanel } from "./RecordPanel";
import { dayOf, endDayOf } from "@/lib/cellText";
import type { FieldLite } from "@/lib/cellText";

type Rec = { id: string; cells: Record<string, unknown>; order: string };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function CalendarView({
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
  const addRecord = trpc.db.addRecord.useMutation({ onSuccess: invalidate });
  const updateView = trpc.db.updateView.useMutation({ onSuccess: invalidate });

  const dateFields = fields.filter((f) => f.type === "date");
  const cfg = (view.config ?? {}) as { dateFieldId?: string };
  const dateFieldId = cfg.dateFieldId ?? dateFields[0]?.id ?? null;
  const titleField = fields.find((f) => f.type === "text") ?? fields[0];

  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [openRec, setOpenRec] = useState<Rec | null>(null);

  // Registros indexados por día (YYYY-MM-DD).
  const byDay = useMemo(() => {
    const map = new Map<string, Rec[]>();
    if (!dateFieldId) return map;
    for (const r of records) {
      const v = r.cells?.[dateFieldId];
      const from = dayOf(v);
      if (!from) continue;
      // Con rango, la fila aparece en todos sus días (tope de un año, por si el dato viene raro).
      const to = endDayOf(v) ?? from;
      for (let d = new Date(`${from}T00:00:00`), i = 0; d <= new Date(`${to}T00:00:00`) && i < 366; d.setDate(d.getDate() + 1), i++) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        map.set(key, [...(map.get(key) ?? []), r]);
      }
    }
    return map;
  }, [records, dateFieldId]);

  if (!dateFieldId) {
    return (
      <div className="py-10 text-[var(--muted)]">
        Esta base de datos no tiene ningún campo de fecha. Añade uno para usar el calendario.
      </div>
    );
  }

  // Rejilla del mes (empezando en lunes).
  const first = new Date(cursor.y, cursor.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.y, cursor.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = ymd(today);

  const recTitle = (r: Rec) => {
    const t = titleField ? r.cells?.[titleField.id] : "";
    return (typeof t === "string" && t) || "Sin título";
  };

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => setCursor({ y: today.getFullYear(), m: today.getMonth() });

  const addOn = (key: string) => {
    if (!titleField) return;
    addRecord.mutate({
      collectionId,
      cells: { [titleField.id]: "Nuevo", [dateFieldId]: key },
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={prev} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="font-display min-w-[9rem] text-center text-lg font-bold">
          {MONTHS[cursor.m]} {cursor.y}
        </span>
        <button onClick={next} className="rounded px-2 py-1 hover:bg-[var(--border)]/30" aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </button>
        <button onClick={goToday} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--border)]/30">
          Hoy
        </button>

        {dateFields.length > 1 && (
          <select
            value={dateFieldId}
            onChange={(e) => updateView.mutate({ id: view.id, config: { ...cfg, dateFieldId: e.target.value } })}
            className="ml-auto rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none"
          >
            {dateFields.map((f) => (
              <option key={f.id} value={f.id}>
                Por: {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-[var(--background)] px-2 py-1.5 text-center text-xs font-medium text-[var(--muted)]">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const key = d ? ymd(d) : null;
          const recs = key ? byDay.get(key) ?? [] : [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`group min-h-[92px] bg-[var(--background)] p-1 ${d ? "" : "opacity-40"}`}
            >
              {d && (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-xs ${
                        isToday
                          ? "flex size-5 items-center justify-center rounded-full bg-brand font-semibold text-white"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <button
                      onClick={() => addOn(key!)}
                      className="text-xs text-[var(--muted)] al-pasar hover:text-[var(--foreground)]"
                      title="Añadir aquí"
                    >
                      +
                    </button>
                  </div>
                  <div className="space-y-1">
                    {recs.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setOpenRec(r)}
                        className="block w-full truncate rounded bg-[var(--border)]/30 px-1.5 py-0.5 text-left text-xs hover:bg-brand/10"
                        title={recTitle(r)}
                      >
                        {recTitle(r)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {openRec && (
        <RecordPanel
          pageId={pageId}
          record={openRec}
          fields={fields}
          onClose={() => setOpenRec(null)}
        />
      )}
    </div>
  );
}
