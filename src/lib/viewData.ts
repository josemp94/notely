// Aplica filtros y orden (guardados en view.config) a los registros, en cliente.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { dayOf, endDayOf, OPTION_COLORS } from "./cellText";

export type DbField = { id: string; name: string; type: string; config: any };
export type DbRecord = { id: string; cells: Record<string, unknown>; order: string };
export type Filter = { fieldId: string; op: string; value: any };
/** Grupo anidado estilo Notion: sus hijos se combinan con su propio op. */
export type FilterGroup = { type: "group"; op: "and" | "or"; filters: FilterNode[] };
export type FilterNode = Filter | FilterGroup;
export type Sort = { fieldId: string; dir: "asc" | "desc" };

export const isFilterGroup = (n: FilterNode): n is FilterGroup =>
  (n as FilterGroup).type === "group";

/** Nº de condiciones (hojas) de un árbol de filtros, para el contador de la UI. */
export function countFilters(nodes: FilterNode[]): number {
  return nodes.reduce((acc, n) => acc + (isFilterGroup(n) ? countFilters(n.filters) : 1), 0);
}

const s = (v: unknown): string => {
  if (v == null) return "";
  // Celdas de varios valores: adjuntos ({name}), personas y etiquetas (ids).
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? ((x as { name?: string }).name ?? "") : String(x))).join(", ");
  return String(v);
};
const n = (v: unknown) => (typeof v === "number" ? v : parseFloat(s(v)));
const t = (v: unknown) => {
  const d = new Date(dayOf(v) ?? s(v));
  return isNaN(d.getTime()) ? null : d.getTime();
};

/** "YYYY-MM-DD" de una celda de fecha (día suelto, con hora o rango); null si no hay. */
const day = (v: unknown): string | null => {
  const start = dayOf(v);
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(s(v));
  return isNaN(d.getTime()) ? null : localDay(d);
};

/** Día local (no UTC: toISOString desplazaría la fecha según la zona horaria). */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Rango [desde, hasta] en días locales de un operador de fecha relativo. */
export function relativeRange(op: string, now = new Date()): [string, string] | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (op) {
    case "today":
      return [localDay(today), localDay(today)];
    case "this_week": {
      // Semana de lunes a domingo (convención española).
      const monday = shift(today, -((today.getDay() + 6) % 7));
      return [localDay(monday), localDay(shift(monday, 6))];
    }
    case "this_month":
      return [
        localDay(new Date(today.getFullYear(), today.getMonth(), 1)),
        localDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      ];
    case "last_7_days":
      return [localDay(shift(today, -6)), localDay(today)];
    case "next_7_days":
      return [localDay(today), localDay(shift(today, 6))];
    default:
      return null;
  }
}

/** Operadores que no piden valor: la UI no dibuja input y evalNode no los descarta por vacíos. */
export const NO_VALUE_OPS = new Set([
  "is_empty",
  "not_empty",
  "today",
  "this_week",
  "this_month",
  "last_7_days",
  "next_7_days",
]);

const EMPTY_OPS = [
  { value: "is_empty", label: "está vacío" },
  { value: "not_empty", label: "no está vacío" },
];

/** Operadores disponibles por tipo de campo. */
export function opsFor(type: string): { value: string; label: string }[] {
  switch (type) {
    case "number":
      return [
        { value: "eq", label: "=" },
        { value: "gt", label: ">" },
        { value: "lt", label: "<" },
        ...EMPTY_OPS,
      ];
    case "select":
    case "multiselect":
    case "status":
    case "person":
      return [
        { value: "is", label: "es" },
        { value: "isnot", label: "no es" },
        ...EMPTY_OPS,
      ];
    case "checkbox":
      return [{ value: "is", label: "es" }];
    case "date":
      return [
        { value: "on", label: "el día" },
        { value: "before", label: "antes de" },
        { value: "after", label: "después de" },
        { value: "today", label: "es hoy" },
        { value: "this_week", label: "esta semana" },
        { value: "this_month", label: "este mes" },
        { value: "last_7_days", label: "últimos 7 días" },
        { value: "next_7_days", label: "próximos 7 días" },
        ...EMPTY_OPS,
      ];
    default:
      return [
        { value: "contains", label: "contiene" },
        { value: "eq", label: "es igual a" },
        ...EMPTY_OPS,
      ];
  }
}

/** Vacío = sin valor, cadena vacía o lista sin elementos (una casilla sin marcar NO está vacía). */
const isEmpty = (cell: unknown) =>
  cell == null || cell === "" || (Array.isArray(cell) && cell.length === 0);

function matchFilter(cell: unknown, field: DbField, op: string, value: any): boolean {
  const range = relativeRange(op);
  if (range) {
    // Con rango de fechas basta con que solape el periodo.
    const from = day(cell);
    if (from == null) return false;
    const to = endDayOf(cell) ?? from;
    return from <= range[1] && to >= range[0];
  }
  switch (op) {
    case "is_empty":
      return isEmpty(cell);
    case "not_empty":
      return !isEmpty(cell);
    case "contains":
      return s(cell).toLowerCase().includes(s(value).toLowerCase());
    case "eq":
      if (field.type === "number") return n(cell) === n(value);
      return s(cell).toLowerCase() === s(value).toLowerCase();
    case "is":
      if (field.type === "checkbox") return Boolean(cell) === (value === true || value === "true");
      // multiselect y person guardan varios valores: "es" = lo contiene
      if (Array.isArray(cell)) return cell.map(s).includes(s(value));
      return s(cell) === s(value);
    case "isnot":
      if (Array.isArray(cell)) return !cell.map(s).includes(s(value));
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
  if (field.type === "number") {
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
  if (field.type === "select" || field.type === "status") {
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

/** Evalúa un nodo; null = ignorar (condición incompleta o grupo sin condiciones activas). */
function evalNode(node: FilterNode, r: DbRecord, byId: Map<string, DbField>): boolean | null {
  if (isFilterGroup(node)) {
    const results = node.filters
      .map((c) => evalNode(c, r, byId))
      .filter((x): x is boolean => x !== null);
    if (!results.length) return null;
    return node.op === "or" ? results.some(Boolean) : results.every(Boolean);
  }
  const field = byId.get(node.fieldId);
  if (!field) return null;
  if (!NO_VALUE_OPS.has(node.op) && (node.value === "" || node.value == null)) return null;
  return matchFilter(r.cells[node.fieldId], field, node.op, node.value);
}

/** Regla de color: si el registro cumple sus condiciones, la fila se pinta de ese color. */
export type ColorRule = { id: string; color: string; filters: FilterNode[] };

/** ¿El registro cumple estas condiciones? (mismo motor que los filtros de la vista). */
export function matchesFilters(record: DbRecord, fields: DbField[], nodes: FilterNode[]): boolean {
  if (!nodes.length) return false;
  const byId = new Map(fields.map((f) => [f.id, f]));
  return evalNode({ type: "group", op: "and", filters: nodes }, record, byId) === true;
}

/** Color de la primera regla que cumple el registro (las reglas se evalúan en orden). */
export function colorByRules(record: DbRecord, fields: DbField[], rules: ColorRule[] | undefined): string | undefined {
  if (!rules?.length) return undefined;
  const hit = rules.find((rule) => matchesFilters(record, fields, rule.filters ?? []));
  return hit ? OPTION_COLORS[hit.color] ?? undefined : undefined;
}

export function applyViewConfig(records: DbRecord[], fields: DbField[], config: any): DbRecord[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  let out = records;
  // Retrocompat: el formato plano (filters[] + filterOp) es el grupo raíz.
  const root: FilterGroup = {
    type: "group",
    op: config?.filterOp === "or" ? "or" : "and",
    filters: Array.isArray(config?.filters) ? config.filters : [],
  };
  out = out.filter((r) => evalNode(root, r, byId) !== false);
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
