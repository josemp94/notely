import { OPTION_COLORS } from "./cellText";

/**
 * Infiere el tipo de cada columna de un CSV mirando sus valores (como hace Notion
 * al importar): casilla, número, fecha, correo, URL, teléfono, selección (simple o
 * múltiple si hay comas) y, si nada encaja, texto. La primera columna es siempre
 * texto: es el título de la fila. Equivocarse no es grave — el tipo se puede
 * cambiar después con «Cambiar tipo», que convierte los valores.
 */

export type ColumnaInferida = {
  type: string;
  config: Record<string, unknown>;
  convertir: (v: string) => unknown;
};

const SI = new Set(["yes", "true", "sí", "si", "checked"]);
const NO = new Set(["no", "false", "unchecked"]);

const esNumero = (v: string) => v.trim() !== "" && !Number.isNaN(Number(v.trim()));
const esEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const esUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());
const esTelefono = (v: string) => /^[+\d][\d\s().-]{5,}$/.test(v.trim());

// Date.parse de V8 se traga casi cualquier texto con un número («nota 2» → año 2002),
// así que antes se exige que el valor tenga pinta de fecha: ISO, d/m/a o mes en inglés
// (el export de Notion siempre sale con los meses en inglés).
const PATRON_FECHA =
  /(\d{4}-\d{2}-\d{2})|(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|((january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4})/i;

/** Date.parse sobre el formato de export de Notion («August 21, 2026 2:00 PM (GMT+2)») o ISO. */
function parseaFecha(v: string): Date | null {
  const limpio = v.trim().replace(/\s*\([^)]*\)\s*$/, "");
  if (!PATRON_FECHA.test(limpio)) return null;
  const t = Date.parse(limpio);
  return Number.isNaN(t) ? null : new Date(t);
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

function fechaACelda(v: string): unknown {
  const d = parseaFecha(v);
  if (!d) return v;
  const dia = `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
  // Con hora explícita se conserva; «12:00 AM» exacto casi siempre es solo-día.
  return /\d:\d\d/.test(v) ? `${dia}T${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}` : dia;
}

function opcionesDe(labels: string[]): { id: string; label: string; color: string }[] {
  const colores = Object.keys(OPTION_COLORS);
  return labels.map((label, i) => ({
    id: "opt_" + Math.random().toString(36).slice(2, 9),
    label,
    color: colores[i % colores.length],
  }));
}

const texto: ColumnaInferida = { type: "text", config: {}, convertir: (v) => v };

function infiereColumna(valores: string[]): ColumnaInferida {
  const llenos = valores.map((v) => v.trim()).filter((v) => v !== "");
  if (!llenos.length) return texto;

  if (llenos.every((v) => SI.has(v.toLowerCase()) || NO.has(v.toLowerCase())))
    return { type: "checkbox", config: {}, convertir: (v) => SI.has(v.trim().toLowerCase()) };
  if (llenos.every(esNumero))
    return { type: "number", config: {}, convertir: (v) => Number(v.trim()) };
  if (llenos.every((v) => parseaFecha(v) !== null))
    return { type: "date", config: {}, convertir: fechaACelda };
  if (llenos.every(esEmail)) return { type: "email", config: {}, convertir: (v) => v.trim() };
  if (llenos.every(esUrl)) return { type: "url", config: {}, convertir: (v) => v.trim() };
  if (llenos.every(esTelefono)) return { type: "phone", config: {}, convertir: (v) => v.trim() };

  // Selección: pocas etiquetas distintas, cortas y repetidas. Con comas, múltiple.
  if (llenos.length >= 4) {
    const multi = llenos.some((v) => v.includes(", "));
    const tokens = multi ? llenos.flatMap((v) => v.split(", ")) : llenos;
    const distintos = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
    if (
      distintos.length <= 12 &&
      distintos.length <= Math.max(2, tokens.length / 2) &&
      distintos.every((t) => t.length <= 32)
    ) {
      const opciones = opcionesDe(distintos);
      const idDe = new Map(opciones.map((o) => [o.label, o.id]));
      if (multi)
        return {
          type: "multiselect",
          config: { options: opciones },
          convertir: (v) =>
            v.split(", ").map((t) => idDe.get(t.trim())).filter(Boolean),
        };
      return {
        type: "select",
        config: { options: opciones },
        convertir: (v) => idDe.get(v.trim()) ?? null,
      };
    }
  }
  return texto;
}

export function infiereColumnas(headers: string[], rows: string[][]): ColumnaInferida[] {
  return headers.map((_, i) =>
    i === 0 ? texto : infiereColumna(rows.map((r) => r[i] ?? "")),
  );
}
