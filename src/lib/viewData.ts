// Aplica filtros y orden (guardados en view.config) a los registros, en cliente.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type DbField = { id: string; name: string; type: string; config: any };
export type DbRecord = { id: string; cells: Record<string, unknown>; order: string };
export type Filter = { fieldId: string; op: string; value: any };
export type Sort = { fieldId: string; dir: "asc" | "desc" };

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : parseFloat(s(v)));
const t = (v: unknown) => {
  const d = new Date(s(v));
  return isNaN(d.getTime()) ? null : d.getTime();
};

/** Operadores disponibles por tipo de campo. */
export function opsFor(type: string): { value: string; label: string }[] {
  switch (type) {
    case "number":
    case "currency":
      return [
        { value: "eq", label: "=" },
        { value: "gt", label: ">" },
        { value: "lt", label: "<" },
      ];
    case "select":
    case "multiselect":
      return [
        { value: "is", label: "es" },
        { value: "isnot", label: "no es" },
      ];
    case "checkbox":
      return [{ value: "is", label: "es" }];
    case "date":
      return [
        { value: "on", label: "el día" },
        { value: "before", label: "antes de" },
        { value: "after", label: "después de" },
      ];
    default:
      return [
        { value: "contains", label: "contiene" },
        { value: "eq", label: "es igual a" },
      ];
  }
}

function matchFilter(cell: unknown, field: DbField, op: string, value: any): boolean {
  switch (op) {
    case "contains":
      return s(cell).toLowerCase().includes(s(value).toLowerCase());
    case "eq":
      if (field.type === "number" || field.type === "currency") return n(cell) === n(value);
      return s(cell).toLowerCase() === s(value).toLowerCase();
    case "is":
      if (field.type === "checkbox") return Boolean(cell) === (value === true || value === "true");
      if (field.type === "multiselect") return Array.isArray(cell) && cell.includes(value);
      return s(cell) === s(value);
    case "isnot":
      if (field.type === "multiselect") return !(Array.isArray(cell) && cell.includes(value));
      return s(cell) !== s(value);
    case "gt":
      return n(cell) > n(value);
    case "lt":
      return n(cell) < n(value);
    case "on": {
      const a = t(cell), b = t(value);
      if (a == null || b == null) return false;
      return new Date(a).toDateString() === new Date(b).toDateString();
    }
    case "before": {
      const a = t(cell), b = t(value);
      return a != null && b != null && a < b;
    }
    case "after": {
      const a = t(cell), b = t(value);
      return a != null && b != null && a > b;
    }
    default:
      return true;
  }
}

function compareCells(a: unknown, b: unknown, field?: DbField): number {
  if (!field) return s(a).localeCompare(s(b));
  if (field.type === "number" || field.type === "currency") {
    const x = n(a), y = n(b);
    if (isNaN(x) && isNaN(y)) return 0;
    if (isNaN(x)) return 1;
    if (isNaN(y)) return -1;
    return x - y;
  }
  if (field.type === "date") {
    const x = t(a), y = t(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y;
  }
  if (field.type === "checkbox") return Number(Boolean(a)) - Number(Boolean(b));
  if (field.type === "select") {
    // ordena por el orden de las opciones definidas
    const opts: any[] = field.config?.options ?? [];
    const idx = (v: unknown) => {
      const i = opts.findIndex((o) => o.id === v);
      return i === -1 ? 999 : i;
    };
    return idx(a) - idx(b);
  }
  return s(a).localeCompare(s(b));
}

export function applyViewConfig(records: DbRecord[], fields: DbField[], config: any): DbRecord[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  let out = records;
  const filters: Filter[] = Array.isArray(config?.filters) ? config.filters : [];
  for (const f of filters) {
    const field = byId.get(f.fieldId);
    if (!field || f.value === "" || f.value == null) continue;
    out = out.filter((r) => matchFilter(r.cells[f.fieldId], field, f.op, f.value));
  }
  const sorts: Sort[] = Array.isArray(config?.sorts) ? config.sorts : [];
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const so of sorts) {
        const cmp = compareCells(a.cells[so.fieldId], b.cells[so.fieldId], byId.get(so.fieldId));
        if (cmp !== 0) return so.dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }
  return out;
}
