// Cálculos de columna (fila de totales y subtotales por grupo). Funciones puras:
// se comprueban en scripts/check.ts.
import { formatNumber, type FieldLite } from "./cellText";

type RecordLite = { cells?: Record<string, unknown> | null };

export const CALC_OPTS: [string, string][] = [
  ["", "Calcular"],
  ["count", "Contar todo"],
  ["filled", "No vacías"],
  ["empty", "Vacías"],
  ["percent_filled", "% no vacías"],
  ["sum", "Suma"],
  ["avg", "Media"],
  ["min", "Mín"],
  ["max", "Máx"],
];

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeCalc(calc: string, field: FieldLite, records: RecordLite[]): string {
  if (!calc) return "";
  const vals = records.map((r) => r.cells?.[field.id]);
  const nonEmpty = vals.filter(
    (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  const nums = nonEmpty.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  // Los cálculos de un campo Número se muestran con su formato (€, %, miles).
  const num = (n: number) => (field.type === "number" ? formatNumber(n, field) : String(round2(n)));
  switch (calc) {
    case "count":
      return String(records.length);
    case "filled":
      return String(nonEmpty.length);
    case "empty":
      return String(records.length - nonEmpty.length);
    case "percent_filled":
      return records.length ? Math.round((nonEmpty.length / records.length) * 100) + "%" : "0%";
    case "sum":
      return nums.length ? num(round2(nums.reduce((a, b) => a + b, 0))) : "—";
    case "avg":
      return nums.length ? num(round2(nums.reduce((a, b) => a + b, 0) / nums.length)) : "—";
    case "min":
      return nums.length ? num(Math.min(...nums)) : "—";
    case "max":
      return nums.length ? num(Math.max(...nums)) : "—";
    default:
      return "";
  }
}

