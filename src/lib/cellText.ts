// Texto visible de las celdas y agrupación de filas. Funciones puras (sin React):
// se usan en las vistas de base de datos y se comprueban en scripts/check.ts.

export type Option = { id: string; label: string; color?: string; group?: string };

/** Grupos del campo Estado, en el orden en que los muestra Notion. */
export const STATUS_GROUPS: [string, string][] = [
  ["todo", "Por hacer"],
  ["doing", "En curso"],
  ["done", "Hecho"],
];
export type FieldLite = { id: string; name: string; type: string; config: unknown };
/** Adjunto del campo "Archivos y multimedia" (los bytes viven en el modelo Asset). */
export type Attachment = { id: string; url: string; name?: string | null; mime?: string | null };
export type RecordLite = { id: string; cells?: Record<string, unknown> | null };

/**
 * Valor de una celda de fecha. Retrocompatible: durante mucho tiempo se guardó
 * como una cadena suelta "YYYY-MM-DD"; con hora es "YYYY-MM-DDTHH:mm" y con
 * rango un objeto { start, end }.
 */
export type DateValue = { start: string; end?: string };

export function dateValue(v: unknown): DateValue | null {
  if (!v) return null;
  if (typeof v === "string") return { start: v };
  if (typeof v === "object") {
    const o = v as { start?: unknown; end?: unknown };
    if (typeof o.start === "string" && o.start) {
      return { start: o.start, end: typeof o.end === "string" && o.end ? o.end : undefined };
    }
  }
  return null;
}

/** Día "YYYY-MM-DD" del inicio de una celda de fecha (null si no hay fecha). */
export function dayOf(v: unknown): string | null {
  const d = dateValue(v);
  return d ? d.start.slice(0, 10) : null;
}

/** Día "YYYY-MM-DD" del final (el inicio si no hay rango). */
export function endDayOf(v: unknown): string | null {
  const d = dateValue(v);
  return d ? (d.end ?? d.start).slice(0, 10) : null;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "5 ago 2026", "5 ago 2026 14:30" o "5 ago 2026 → 8 ago 2026". */
export function formatDate(v: unknown): string {
  const d = dateValue(v);
  if (!d) return "";
  const one = (iso: string) => {
    const [date, time] = iso.split("T");
    const [y, m, day] = date.split("-");
    if (!y || !m || !day) return iso;
    const txt = `${Number(day)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
    return time ? `${txt} ${time.slice(0, 5)}` : txt;
  };
  return d.end ? `${one(d.start)} → ${one(d.end)}` : one(d.start);
}

/** Formatos del campo Número, como en Notion. */
export const NUMBER_FORMATS: [string, string][] = [
  ["plain", "Normal"],
  ["euro", "Euros (€)"],
  ["percent", "Porcentaje (%)"],
  ["bar", "Barra"],
];

/** Texto de un número según el formato del campo (es-ES: 1.234,5). */
export function formatNumber(value: unknown, field: FieldLite): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const format = (field.config as { format?: string } | null)?.format ?? "plain";
  const es = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (format === "euro") return `${es(n)} €`;
  if (format === "percent") return `${es(n)} %`;
  return es(n);
}

/** Colores de las etiquetas de Selección/Estado (fondo suave). */
export const OPTION_COLORS: Record<string, string> = {
  gray: "#e5e0d8",
  orange: "#ffd9c9",
  green: "#c9efd8",
  red: "#ffd2cd",
  blue: "#cfe0ff",
  yellow: "#fbeec2",
};

/**
 * Color de fondo de una fila según la opción elegida en el campo de color de la
 * vista (`rowColorFieldId`). Devuelve undefined si no aplica.
 */
export function rowColor(field: FieldLite | undefined, cells: Record<string, unknown> | null | undefined): string | undefined {
  if (!field) return undefined;
  const value = cells?.[field.id];
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) return undefined;
  const opt = optionsOf(field).find((o) => o.id === id);
  return opt ? OPTION_COLORS[opt.color ?? "gray"] : undefined;
}

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
  if (field.type === "number") return formatNumber(value, field);
  if (field.type === "date") return formatDate(value);
  if (field.type === "checkbox") return value ? "Sí" : "No";
  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return n ? `${n} vinculado${n > 1 ? "s" : ""}` : "";
  }
  // Calculados y automáticos: no viven en la celda (el autor y las fechas salen del propio registro).
  if (["rollup", "formula", "created_by", "last_edited_by", "created_time", "last_edited_time"].includes(field.type))
    return "";
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
