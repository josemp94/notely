/**
 * Comprobación mínima de la lógica de vistas (filtros y orden).
 * Ejecutar: npm run check
 */
import assert from "node:assert/strict";
import { applyViewConfig, colorByRules, matchesFilters, opsFor, relativeRange, type DbField, type DbRecord } from "../src/lib/viewData";
import { dateValue, dayOf, displayValue, endDayOf, formatDate, formatNumber, frozenOffsets, FROZEN_WIDTH, GUTTER_WIDTH, groupBy, rowColor } from "../src/lib/cellText";
import { embedUrl } from "../src/lib/embed";
import { computeCalc } from "../src/lib/calc";

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

// --- Texto visible de las celdas ---
const gente = new Map([["u1", "Jose"], ["u2", "Ana"]]);
assert.equal(displayValue(fields[0], ["u1", "u2"], gente), "Jose, Ana");
assert.equal(displayValue(fields[3], "done"), "Hecho"); // estado -> etiqueta, no el id
assert.equal(displayValue(f("adj", "files"), [{ id: "a", url: "/x", name: "acta.pdf" }]), "acta.pdf");

// --- Agrupación de la tabla ---
const grupos = groupBy(records, fields[3], gente); // por Estado
assert.deepEqual(grupos.map((g) => g.label), ["Por hacer", "Hecho"]); // orden de las opciones, no alfabético
assert.deepEqual(grupos.map((g) => g.records.length), [2, 1]);

// Las filas sin valor van a un grupo propio, siempre el último.
const sinValor = groupBy(
  [...records, r("d", {})],
  f("estado", "status", { options: [{ id: "todo", label: "Por hacer" }, { id: "done", label: "Hecho" }] }),
  gente,
);
assert.equal(sinValor.at(-1)!.label, "Sin estado");

// --- Formatos del campo Número ---
const euros = f("precio", "number", { format: "euro" });
// En es-ES no se agrupan los miles hasta 5 dígitos (regla CLDR): 1234,5 pero 12.345,6.
assert.equal(formatNumber(1234.5, euros), "1234,5 €");
assert.equal(formatNumber(12345.6, euros), "12.345,6 €");
assert.equal(formatNumber(0, euros), "0 €");
assert.equal(formatNumber(null, euros), "");
assert.equal(formatNumber(30, f("pct", "number", { format: "percent" })), "30 %");
assert.equal(formatNumber(1234.5, f("n", "number")), "1234,5");
assert.equal(displayValue(euros, 12), "12 €"); // el formato también manda en tarjetas y listas

// --- Fechas: día suelto (formato antiguo), con hora y rango ---
assert.deepEqual(dateValue("2026-08-05"), { start: "2026-08-05" }); // sigue leyéndose lo ya guardado
assert.deepEqual(dateValue({ start: "2026-08-05", end: "2026-08-08" }), { start: "2026-08-05", end: "2026-08-08" });
assert.equal(dateValue(null), null);
assert.equal(dayOf({ start: "2026-08-05T14:30", end: "2026-08-08" }), "2026-08-05");
assert.equal(endDayOf({ start: "2026-08-05", end: "2026-08-08" }), "2026-08-08");
assert.equal(endDayOf("2026-08-05"), "2026-08-05"); // sin rango, el fin es el inicio
assert.equal(formatDate("2026-08-05"), "5 ago 2026");
assert.equal(formatDate("2026-08-05T14:30"), "5 ago 2026 14:30");
assert.equal(formatDate({ start: "2026-08-05", end: "2026-08-08" }), "5 ago 2026 → 8 ago 2026");

// Un filtro relativo debe coger la fila cuyo rango solapa el periodo, no solo la que empieza dentro.
const hoyISO = relativeRange("today")![0];
const ayer = relativeRange("last_7_days")![0];
const fechas: DbField[] = [f("cuando", "date")];
const filas: DbRecord[] = [
  r("solapa", { cuando: { start: ayer, end: relativeRange("next_7_days")![1] } }),
  r("fuera", { cuando: "1999-01-01" }),
  r("justo", { cuando: hoyISO }),
];
assert.equal(
  applyViewConfig(filas, fechas, { filters: [{ fieldId: "cuando", op: "today", value: null }] })
    .map((x) => x.id)
    .join(","),
  "solapa,justo",
);

// --- Color de fila por la opción elegida ---
const estado = fields[3];
assert.equal(rowColor(estado, { estado: "done" }), "#e5e0d8"); // opción sin color asignado: gris
const conColor = f("prio", "status", { options: [{ id: "alta", label: "Alta", color: "red" }] });
assert.equal(rowColor(conColor, { prio: "alta" }), "#ffd2cd");
assert.equal(rowColor(estado, {}), undefined); // sin valor, sin color
assert.equal(rowColor(undefined, { estado: "done" }), undefined); // sin campo de color configurado
assert.equal(rowColor(fields[1], { tags: ["t1"] }), undefined); // opción inexistente: sin color

// --- Enlaces de vídeo que se incrustan como reproductor ---
assert.equal(embedUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/embed/abc123");
assert.equal(embedUrl("https://youtu.be/xyz789"), "https://www.youtube.com/embed/xyz789");
assert.equal(embedUrl("https://vimeo.com/123456"), "https://player.vimeo.com/video/123456");
assert.equal(embedUrl("https://elpais.com/receta"), null); // una web normal es tarjeta, no reproductor
assert.equal(embedUrl("no es una url"), null);

// --- Reglas de color: mismas condiciones que los filtros, primera que casa gana ---
const reglaFields: DbField[] = [f("cuando", "date"), f("estado", "status", { options: [{ id: "done", label: "Hecho" }] })];
const vencida = r("v", { cuando: "1999-01-01" });
const hecha = r("h", { cuando: "1999-01-01", estado: "done" });

const reglas = [
  { id: "1", color: "green", filters: [{ fieldId: "estado", op: "is", value: "done" }] },
  { id: "2", color: "red", filters: [{ fieldId: "cuando", op: "before", value: "2020-01-01" }] },
];
assert.equal(colorByRules(hecha, reglaFields, reglas), "#c9efd8"); // gana la primera que cumple
assert.equal(colorByRules(vencida, reglaFields, reglas), "#ffd2cd");
assert.equal(colorByRules(r("x", {}), reglaFields, reglas), undefined); // no cumple ninguna
assert.equal(colorByRules(vencida, reglaFields, []), undefined); // sin reglas, sin color

// Una regla sin condiciones no debe pintar todo (sería el error fácil aquí).
assert.equal(matchesFilters(vencida, reglaFields, []), false);
assert.equal(colorByRules(vencida, reglaFields, [{ id: "3", color: "red", filters: [] }]), undefined);

// --- Cálculos de columna (fila de totales y subtotales por grupo) ---
const precio = f("precio", "number", { format: "euro" });
const filasCalc = [
  r("1", { precio: 10.5 }),
  r("2", { precio: 4.5 }),
  r("3", {}), // vacía: no cuenta como valor
  r("4", { precio: 0 }), // cero SÍ es un valor
];
assert.equal(computeCalc("count", precio, filasCalc), "4");
assert.equal(computeCalc("filled", precio, filasCalc), "3");
assert.equal(computeCalc("empty", precio, filasCalc), "1");
assert.equal(computeCalc("percent_filled", precio, filasCalc), "75%");
assert.equal(computeCalc("sum", precio, filasCalc), "15 €"); // con el formato del campo
assert.equal(computeCalc("avg", precio, filasCalc), "5 €");
assert.equal(computeCalc("min", precio, filasCalc), "0 €");
assert.equal(computeCalc("max", precio, filasCalc), "10,5 €");
assert.equal(computeCalc("sum", precio, [r("x", {})]), "—"); // sin números, no se inventa un 0
assert.equal(computeCalc("", precio, filasCalc), ""); // sin cálculo elegido, celda vacía

// --- Columnas congeladas (dónde se ancla cada una al desplazar en horizontal) ---
assert.deepEqual(frozenOffsets([100, 200, 50], 0, GUTTER_WIDTH), [null, null, null]); // ninguna
assert.deepEqual(frozenOffsets([100, 200, 50], 1, GUTTER_WIDTH), [GUTTER_WIDTH, null, null]); // la de siempre
assert.deepEqual(frozenOffsets([100, 200, 50], 2, GUTTER_WIDTH), [GUTTER_WIDTH, GUTTER_WIDTH + 100, null]); // se acumulan los anchos
// Sin ancho fijo se le supone uno: si no, la siguiente se anclaría encima.
assert.deepEqual(frozenOffsets([undefined, 40], 2, GUTTER_WIDTH), [GUTTER_WIDTH, GUTTER_WIDTH + FROZEN_WIDTH]);

// --- Edición simultánea: que el socket quede de verdad enganchado ---
// Se levanta un servidor real con dos clientes porque este fallo no da la cara:
// si el enganche se rompe, la conexión se abre igual, nadie da error y
// sencillamente no se sincroniza nada. Así estuvo, roto y en silencio.
async function compruebaColaboracion() {
  const { createServer } = await import("node:http");
  const { WebSocketServer } = await import("ws");
  const { Hocuspocus } = await import("@hocuspocus/server");
  const { HocuspocusProvider } = await import("@hocuspocus/provider");
  const Y = await import("yjs");
  const { attachConnection } = await import("../collab/hocuspocus");

  const hocuspocus = new Hocuspocus({});
  const wss = new WebSocketServer({ noServer: true });
  const server = createServer((_req, res) => res.end("ok"));
  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => attachConnection(hocuspocus, ws, request));
  });
  await new Promise<void>((listo) => server.listen(0, "127.0.0.1", listo));
  const { port } = server.address() as { port: number };

  const cliente = () => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({ url: `ws://127.0.0.1:${port}`, name: "pagina", document: doc });
    return { doc, provider };
  };
  const a = cliente();
  const b = cliente();
  await Promise.race([
    new Promise<void>((sincronizado) => b.provider.on("synced", () => sincronizado())),
    new Promise((_, falla) =>
      setTimeout(() => falla(new Error("el servidor de colaboración no contesta: ¿sigue enganchado el socket?")), 5000),
    ),
  ]);
  a.doc.getText("t").insert(0, "hola");
  await new Promise((espera) => setTimeout(espera, 300));
  assert.equal(b.doc.getText("t").toString(), "hola", "el servidor de colaboración no reparte los cambios");

  a.provider.destroy();
  b.provider.destroy();
  server.close();
}

compruebaColaboracion()
  .then(() => {
    console.log("OK — filtros, orden, celdas, agrupación, formatos, fechas, colores, enlaces, reglas, cálculos y colaboración");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
