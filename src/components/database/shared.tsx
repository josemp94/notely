"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import type { FieldLite } from "./Cell";

export const FIELD_LABELS: Record<string, string> = {
  text: "Texto",
  number: "Número",
  select: "Selección",
  checkbox: "Casilla",
  date: "Fecha",
  relation: "Relación",
  rollup: "Rollup",
};

const TYPES = ["text", "number", "select", "checkbox", "date"] as const;

const AGGS: [string, string][] = [
  ["count", "Contar"],
  ["sum", "Suma"],
  ["avg", "Media"],
  ["min", "Mínimo"],
  ["max", "Máximo"],
  ["values", "Valores"],
];

export function AddFieldButton({
  collectionId,
  fields = [],
  onDone,
}: {
  collectionId: string;
  fields?: FieldLite[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"root" | "relation" | "rollup">("root");
  const [relField, setRelField] = useState<FieldLite | null>(null);
  const [agg, setAgg] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setView("root");
    setRelField(null);
    setAgg(null);
  };
  const done = () => {
    reset();
    onDone();
  };

  const addField = trpc.db.addField.useMutation({ onSuccess: done });
  const addRelation = trpc.db.addRelation.useMutation({ onSuccess: done });
  const addRollup = trpc.db.addRollup.useMutation({ onSuccess: done });
  const { data: databases } = trpc.db.listDatabases.useQuery(undefined, { enabled: open });

  const relationFields = fields.filter((f) => f.type === "relation");
  // Campos de la BD destino de la relación elegida (para rollups sum/avg/…)
  const targetOf = (rf: FieldLite | null) => {
    const tcid = rf ? (rf.config as { targetCollectionId?: string })?.targetCollectionId : null;
    return databases?.find((d) => d.collectionId === tcid);
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        className="rounded px-2 py-0.5 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
        title="Añadir columna"
      >
        +
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg">
          {view === "root" && (
            <>
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => addField.mutate({ collectionId, name: FIELD_LABELS[t], type: t })}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
                >
                  {FIELD_LABELS[t]}
                </button>
              ))}
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                onClick={() => setView("relation")}
                className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
              >
                🔗 Relación →
              </button>
              <button
                onClick={() => setView("rollup")}
                disabled={relationFields.length === 0}
                className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-brand-50 enabled:hover:text-brand disabled:opacity-40"
                title={relationFields.length === 0 ? "Crea antes un campo de Relación" : ""}
              >
                Σ Rollup →
              </button>
            </>
          )}

          {view === "relation" && (
            <>
              <button onClick={() => setView("root")} className="mb-1 block px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-brand">
                ‹ Vincular con…
              </button>
              {(databases ?? []).map((d) => (
                <button
                  key={d.collectionId}
                  onClick={() => addRelation.mutate({ collectionId, name: `→ ${d.title || "BD"}`, targetCollectionId: d.collectionId })}
                  className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
                >
                  <span>{d.icon ?? "🗃️"}</span>
                  <span className="truncate">{d.title || "Sin título"}</span>
                </button>
              ))}
              {(databases ?? []).length === 0 && (
                <div className="px-2 py-1 text-xs text-[var(--muted)]">No hay otras bases de datos.</div>
              )}
            </>
          )}

          {view === "rollup" && !relField && (
            <>
              <button onClick={() => setView("root")} className="mb-1 block px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-brand">
                ‹ Rollup sobre la relación…
              </button>
              {relationFields.map((rf) => (
                <button
                  key={rf.id}
                  onClick={() => setRelField(rf)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
                >
                  {rf.name}
                </button>
              ))}
            </>
          )}

          {view === "rollup" && relField && !agg && (
            <>
              <button onClick={() => setRelField(null)} className="mb-1 block px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-brand">
                ‹ Cómo agregar
              </button>
              {AGGS.map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    if (v === "count") {
                      addRollup.mutate({ collectionId, name: `${relField.name} · nº`, relationFieldId: relField.id, agg: "count" });
                    } else {
                      setAgg(v);
                    }
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
                >
                  {l}
                </button>
              ))}
            </>
          )}

          {view === "rollup" && relField && agg && (
            <>
              <button onClick={() => setAgg(null)} className="mb-1 block px-2 py-1 text-left text-xs text-[var(--muted)] hover:text-brand">
                ‹ Campo a agregar
              </button>
              {(targetOf(relField)?.fields ?? [])
                .filter((tf) => tf.type !== "rollup" && tf.type !== "relation")
                .map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() =>
                      addRollup.mutate({
                        collectionId,
                        name: `${relField.name} · ${tf.name}`,
                        relationFieldId: relField.id,
                        targetFieldId: tf.id,
                        agg: agg as "sum" | "avg" | "min" | "max" | "values",
                      })
                    }
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-brand-50 hover:text-brand"
                  >
                    {tf.name}
                  </button>
                ))}
              {(targetOf(relField)?.fields ?? []).length === 0 && (
                <div className="px-2 py-1 text-xs text-[var(--muted)]">La BD destino no tiene campos.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
