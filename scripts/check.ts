/**
 * Comprobación mínima de la lógica de vistas (filtros y orden).
 * Ejecutar: npm run check
 */
import assert from "node:assert/strict";
import { applyViewConfig, opsFor, type DbField, type DbRecord } from "../src/lib/viewData";

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
assert.deepEqual(opsFor("status").map((o) => o.value), ["is", "isnot"]);
assert.deepEqual(opsFor("person").map((o) => o.value), ["is", "isnot"]);

console.log("OK — filtros y orden de vistas");
