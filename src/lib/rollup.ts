import { dayOf } from "./cellText";

/**
 * Agregaciones de rollup, las de Notion. Puras y compartidas: las calcula el
 * servidor (db.computed), las lista la UI (shared.tsx) y las prueba check.ts.
 * `total` = relaciones enlazadas; `raw` = valores NO vacíos del campo destino.
 */

export const ROLLUP_AGGS = [
  "count",
  "count_values",
  "count_unique",
  "count_empty",
  "count_not_empty",
  "percent_empty",
  "percent_not_empty",
  "sum",
  "avg",
  "median",
  "min",
  "max",
  "range",
  "earliest",
  "latest",
  "date_range",
  "checked",
  "unchecked",
  "percent_checked",
  "percent_unchecked",
  "values",
] as const;

export type RollupAgg = (typeof ROLLUP_AGGS)[number];

/** Etiquetas para el selector, agrupadas como Notion (contar / número / fecha / casilla / mostrar). */
export const ROLLUP_AGG_LABELS: [RollupAgg, string][] = [
  ["count", "Contar relaciones"],
  ["count_values", "Contar valores"],
  ["count_unique", "Contar únicos"],
  ["count_empty", "Contar vacíos"],
  ["count_not_empty", "Contar no vacíos"],
  ["percent_empty", "% vacíos"],
  ["percent_not_empty", "% no vacíos"],
  ["sum", "Suma"],
  ["avg", "Media"],
  ["median", "Mediana"],
  ["min", "Mínimo"],
  ["max", "Máximo"],
  ["range", "Rango"],
  ["earliest", "Fecha más antigua"],
  ["latest", "Fecha más reciente"],
  ["date_range", "Rango de fechas (días)"],
  ["checked", "Marcadas"],
  ["unchecked", "Sin marcar"],
  ["percent_checked", "% marcadas"],
  ["percent_unchecked", "% sin marcar"],
  ["values", "Mostrar valores"],
];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function agregaRollup(
  agg: string,
  total: number,
  raw: unknown[],
  toLabel: (v: unknown) => string = String,
): string | number {
  const pct = (n: number) => (total ? `${r2((n / total) * 100)}%` : "0%");
  const marcadas = raw.filter((v) => v === true).length;
  switch (agg) {
    case "count":
      return total;
    case "count_values":
    case "count_not_empty":
      return raw.length;
    case "count_unique":
      return new Set(raw.map((v) => JSON.stringify(v))).size;
    case "count_empty":
      return total - raw.length;
    case "percent_empty":
      return pct(total - raw.length);
    case "percent_not_empty":
      return pct(raw.length);
    case "checked":
      return marcadas;
    case "unchecked":
      return total - marcadas;
    case "percent_checked":
      return pct(marcadas);
    case "percent_unchecked":
      return pct(total - marcadas);
    case "earliest":
    case "latest":
    case "date_range": {
      // Días "YYYY-MM-DD": el orden lexicográfico ES el cronológico.
      const dias = raw.map(dayOf).filter((d): d is string => !!d).sort();
      if (!dias.length) return "";
      if (agg === "earliest") return dias[0];
      if (agg === "latest") return dias[dias.length - 1];
      return Math.round((Date.parse(dias[dias.length - 1]) - Date.parse(dias[0])) / 86_400_000);
    }
    case "values":
      return raw.map(toLabel).join(", ");
    default: {
      const nums = raw.map(Number).filter(Number.isFinite);
      if (!nums.length) return 0;
      if (agg === "sum") return r2(nums.reduce((a, b) => a + b, 0));
      if (agg === "avg") return r2(nums.reduce((a, b) => a + b, 0) / nums.length);
      if (agg === "min") return Math.min(...nums);
      if (agg === "max") return Math.max(...nums);
      if (agg === "range") return r2(Math.max(...nums) - Math.min(...nums));
      if (agg === "median") {
        const s = [...nums].sort((a, b) => a - b);
        const m = s.length >> 1;
        return s.length % 2 ? s[m] : r2((s[m - 1] + s[m]) / 2);
      }
      return 0;
    }
  }
}
