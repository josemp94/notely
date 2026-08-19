// Texto visible de las celdas y agrupación de filas. Funciones puras (sin React):
// se usan en las vistas de base de datos y se comprueban en scripts/check.ts.

export type Option = { id: string; label: string; color?: string };
export type FieldLite = { id: string; name: string; type: string; config: unknown };
/** Adjunto del campo "Archivos y multimedia" (los bytes viven en el modelo Asset). */
export type Attachment = { id: string; url: string; name?: string | null; mime?: string | null };
export type RecordLite = { id: string; cells?: Record<string, unknown> | null };

export function optionsOf(field: FieldLite): Option[] {
  const cfg = field.config as { options?: Option[] } | null;
  return cfg?.options ?? [];
}

/**
 * Valor de una celda como texto plano para tarjetas y listas.
 * `people` (userId -> nombre) solo hace falta para los campos "person".
 */
export function displayValue(field: FieldLite, value: unknown, people?: Map<string, string>): string {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "select" || field.type === "status") {
    return optionsOf(field).find((o) => o.id === value)?.label ?? String(value);
  }
  if (field.type === "multiselect") {
    const opts = optionsOf(field);
    return (Array.isArray(value) ? value : [value])
      .map((v) => opts.find((o) => o.id === v)?.label ?? String(v))
      .join(", ");
  }
  if (field.type === "person") {
    return (Array.isArray(value) ? value : [value])
      .map((v) => people?.get(String(v)) ?? String(v))
      .join(", ");
  }
  if (field.type === "files") {
    return (Array.isArray(value) ? (value as Attachment[]) : []).map((a) => a.name || "archivo").join(", ");
  }
  if (field.type === "checkbox") return value ? "Sí" : "No";
  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return n ? `${n} vinculado${n > 1 ? "s" : ""}` : "";
  }
  if (field.type === "rollup" || field.type === "formula") return ""; // calculado; no vive en la celda
  return String(value);
}

/** Filas agrupadas por el valor visible del campo, con "Sin …" al final. */
export function groupBy<R extends RecordLite>(
  records: R[],
  field: FieldLite | undefined,
  people: Map<string, string>,
): { key: string; label: string; records: R[] }[] {
  if (!field) return [];
  const empty = `Sin ${field.name.toLowerCase()}`;
  const buckets = new Map<string, R[]>();
  for (const r of records) {
    const label = displayValue(field, r.cells?.[field.id], people) || empty;
    buckets.set(label, [...(buckets.get(label) ?? []), r]);
  }
  // Selección y Estado siguen el orden de sus opciones; el resto, alfabético.
  const order = optionsOf(field).map((o) => o.label);
  const rank = (label: string) => {
    if (label === empty) return Number.MAX_SAFE_INTEGER;
    const i = order.indexOf(label);
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };
  return [...buckets.entries()]
    .map(([label, recs]) => ({ key: label, label, records: recs }))
    .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}
