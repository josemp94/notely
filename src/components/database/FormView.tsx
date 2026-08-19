"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { trpc } from "@/trpc/react";
import { optionsOf, type FieldLite } from "./Cell";

const SUPPORTED = ["text", "number", "select", "status", "date", "checkbox", "url", "email", "phone"];

export function FormView({ pageId, collectionId, fields }: { pageId: string; collectionId: string; fields: FieldLite[] }) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const formFields = fields.filter((f) => SUPPORTED.includes(f.type));

  const addRecord = trpc.db.addRecord.useMutation({
    onSuccess: async () => {
      await utils.db.get.invalidate({ pageId });
      setValues({});
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    },
  });

  const set = (id: string, v: unknown) => setValues((s) => ({ ...s, [id]: v }));

  const submit = () => {
    const cells: Record<string, unknown> = {};
    for (const f of formFields) {
      const v = values[f.id];
      if (v !== undefined && v !== "" && v !== null) cells[f.id] = v;
    }
    addRecord.mutate({ collectionId, cells });
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-[var(--border)] p-6 shadow-sm">
        <div className="space-y-4">
          {formFields.map((f) => (
            <div key={f.id}>
              <label className="mb-1 block text-sm font-medium">{f.name}</label>
              <FieldInput field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />
            </div>
          ))}
          {formFields.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No hay campos compatibles con el formulario.</p>
          )}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={addRecord.isPending || formFields.length === 0}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Enviar
          </button>
          {done && <span className="flex items-center gap-1 text-sm text-green-600"><Check size={14} /> Registro añadido</span>}
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldLite; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";
  if (field.type === "checkbox") {
    return (
      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
    );
  }
  if (field.type === "select" || field.type === "status") {
    return (
      <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">—</option>
        {optionsOf(field).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }
  const type =
    field.type === "date" ? "date"
    : field.type === "number" ? "number"
    : field.type === "url" ? "url"
    : field.type === "email" ? "email"
    : field.type === "phone" ? "tel"
    : "text";
  return <input type={type} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={base} />;
}
