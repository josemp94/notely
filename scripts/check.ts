/**
 * Comprobación mínima de la lógica de vistas (filtros y orden).
 * Ejecutar: npm run check
 */
import assert from "node:assert/strict";
import { applyViewConfig, opsFor, relativeRange, type DbField, type DbRecord } from "../src/lib/viewData";

const f = (id: string, type: string, config: unknown = {}): DbField => ({ id, name: id, type, config });
const r = (id: string, cells: Record<string, unknown>): DbRecord => ({ id, cells, order: id });

const fields: DbField[] = [
  f("people", "person"),
  f("tags", "multiselect"),
  f("docs", "files"),
  f("estado", "status", { options: [{ id: "todo", label: "Por hacer" }, { id: "done", label: "Hecho" }] }),
];

const records: DbRecord[] = [
  r("a", { people: ["u1", "u2"], tags: ["t1"], docs: [{ id: "as1", name: "factura.pdf" }], estado: "done" }),
  r("b", { people: ["u2"], tags: ["t1", "t2"], docs: [], estado: "todo" }),
  r("c", { people: [], tags: [], docs: [{ id: "as2", name: "contrato.docx" }], estado: "todo" }),
];

const ids = (rs: DbRecord[]) => rs.map((x) => x.id).join(",");
const filter = (fieldId: string, op: string, value: unknown) =>
  ids(applyViewConfig(records, fields, { filters: [{ fieldId, op, value }] }));

// Persona: "es" busca dentro de la lista de asignados, no compara la lista entera.
assert.equal(filter("people", "is", "u2"), "a,b");
assert.equal(filter("people", "isnot", "u1"), "b,c");

// Selección múltiple: mismo comportamiento (no debe romperse al generalizar).
assert.equal(filter("tags", "is", "t2"), "b");

// Adjuntos: "contiene" mira el nombre del fichero, no "[object Object]".
assert.equal(filter("docs", "contains", "factura"), "a");
assert.equal(filter("docs", "contains", "pdf"), "a");

// Estado: ordena por el orden de sus opciones (Por hacer antes que Hecho), no alfabéticamente.
assert.equal(
  ids(applyViewConfig(records, fields, { sorts: [{ fieldId: "estado", dir: "asc" }] })),
  "b,c,a",
);

// Estado y Persona ofrecen "es/no es", no "contiene".
for (const type of ["status", "person"]) {
  const ops = opsFor(type).map((o) => o.value);
  assert.deepEqual(ops.slice(0, 2), ["is", "isnot"]);
  assert.ok(!ops.includes("contains"));
}
// Todo tipo puede filtrarse por vacío / no vacío.
for (const type of ["text", "number", "date", "person", "status", "files"]) {
  assert.ok(opsFor(type).some((o) => o.value === "is_empty"), type);
}

// --- Operadores sin valor: vacío / no vacío y fechas relativas ---
const hoy = relativeRange("today")![0];
const dfields: DbField[] = [f("nota", "text"), f("cuando", "date")];
const drecords: DbRecord[] = [
  r("x", { nota: "algo", cuando: hoy }),
  r("y", { nota: "", cuando: "1999-01-01" }),
  r("z", {}),
];
const dfilter = (fieldId: string, op: string) =>
  ids(applyViewConfig(drecords, dfields, { filters: [{ fieldId, op, value: null }] }));

// Sin estas dos, evalNode descartaría el filtro por no tener valor y no filtraría nada.
assert.equal(dfilter("nota", "is_empty"), "y,z");
assert.equal(dfilter("nota", "not_empty"), "x");
assert.equal(dfilter("cuando", "today"), "x");

// La semana va de lunes a domingo y contiene el día de hoy.
const [lunes, domingo] = relativeRange("this_week")!;
assert.ok(lunes <= hoy && hoy <= domingo);
assert.equal(new Date(lunes + "T00:00:00").getDay(), 1);
assert.equal(new Date(domingo + "T00:00:00").getDay(), 0);

// Rango de mes: primer y último día reales (incluye meses de 28/30/31).
assert.deepEqual(relativeRange("this_month", new Date(2026, 1, 15)), ["2026-02-01", "2026-02-28"]);
assert.deepEqual(relativeRange("last_7_days", new Date(2026, 0, 3)), ["2025-12-28", "2026-01-03"]);

console.log("OK — filtros y orden de vistas");
