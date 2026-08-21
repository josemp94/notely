// Evaluador seguro de fórmulas (sin eval). Estilo Notion Formula 2.0.
// Soporta: prop("Campo"), números, cadenas "..", true/false, fechas y LISTAS como
// valores, + - * / %, comparaciones, and/or/not, paréntesis, y funciones de
// número, texto, fecha (now/today/dateAdd/dateBetween/formatDate…) y lista
// (map/filter/find/some/every con `current` e `index`, sort/unique/join…).

export type Val = number | string | boolean | null | Date | Val[];
type Ctx = Record<string, Val>;

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "punc"; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\" && i + 1 < src.length) {
          s += src[i + 1];
          i += 2;
        } else {
          s += src[i++];
        }
      }
      i++; // cierre
      toks.push({ t: "str", v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      toks.push({ t: "num", v: parseFloat(n) });
      continue;
    }
    if (isIdStart(c)) {
      let id = "";
      while (i < src.length && isId(src[i])) id += src[i++];
      toks.push({ t: "id", v: id });
      continue;
    }
    // operadores de 2 chars
    const two = src.slice(i, i + 2);
    if (["==", "!=", ">=", "<="].includes(two)) {
      toks.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%><".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    if ("(),".includes(c)) {
      toks.push({ t: "punc", v: c });
      i++;
      continue;
    }
    throw new Error("Carácter no válido: " + c);
  }
  return toks;
}

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek() {
    return this.toks[this.i];
  }
  next() {
    return this.toks[this.i++];
  }
  expect(t: string, v?: string) {
    const tok = this.next();
    if (!tok || tok.t !== t || (v !== undefined && tok.v !== v)) throw new Error("Sintaxis inválida");
    return tok;
  }

  parse(): Node {
    const n = this.parseOr();
    if (this.i < this.toks.length) throw new Error("Sobran tokens");
    return n;
  }
  parseOr(): Node {
    let l = this.parseAnd();
    while (this.peek()?.t === "id" && this.peek()?.v === "or") {
      this.next();
      l = { k: "or", a: l, b: this.parseAnd() };
    }
    return l;
  }
  parseAnd(): Node {
    let l = this.parseNot();
    while (this.peek()?.t === "id" && this.peek()?.v === "and") {
      this.next();
      l = { k: "and", a: l, b: this.parseNot() };
    }
    return l;
  }
  parseNot(): Node {
    if (this.peek()?.t === "id" && this.peek()?.v === "not") {
      this.next();
      return { k: "not", a: this.parseNot() };
    }
    return this.parseCmp();
  }
  parseCmp(): Node {
    let l = this.parseAdd();
    const p = this.peek();
    if (p?.t === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(p.v)) {
      this.next();
      l = { k: "cmp", op: p.v, a: l, b: this.parseAdd() };
    }
    return l;
  }
  parseAdd(): Node {
    let l = this.parseMul();
    while (this.peek()?.t === "op" && ["+", "-"].includes(String(this.peek()!.v))) {
      const op = String(this.next().v);
      l = { k: "bin", op, a: l, b: this.parseMul() };
    }
    return l;
  }
  parseMul(): Node {
    let l = this.parseUnary();
    while (this.peek()?.t === "op" && ["*", "/", "%"].includes(String(this.peek()!.v))) {
      const op = String(this.next().v);
      l = { k: "bin", op, a: l, b: this.parseUnary() };
    }
    return l;
  }
  parseUnary(): Node {
    if (this.peek()?.t === "op" && this.peek()?.v === "-") {
      this.next();
      return { k: "neg", a: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  parsePrimary(): Node {
    const tok = this.next();
    if (!tok) throw new Error("Fin inesperado");
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "punc" && tok.v === "(") {
      const e = this.parseOr();
      this.expect("punc", ")");
      return e;
    }
    if (tok.t === "id") {
      if (tok.v === "true") return { k: "bool", v: true };
      if (tok.v === "false") return { k: "bool", v: false };
      if (tok.v === "prop") {
        this.expect("punc", "(");
        const s = this.expect("str") as { v: string };
        this.expect("punc", ")");
        return { k: "prop", name: s.v };
      }
      // Identificador sin paréntesis: variable (current/index dentro de map/filter…).
      if (!(this.peek()?.t === "punc" && this.peek()?.v === "(")) {
        return { k: "prop", name: tok.v };
      }
      // llamada a función
      this.expect("punc", "(");
      const args: Node[] = [];
      if (!(this.peek()?.t === "punc" && this.peek()?.v === ")")) {
        args.push(this.parseOr());
        while (this.peek()?.t === "punc" && this.peek()?.v === ",") {
          this.next();
          args.push(this.parseOr());
        }
      }
      this.expect("punc", ")");
      return { k: "call", name: tok.v, args };
    }
    throw new Error("Token inesperado");
  }
}

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "prop"; name: string }
  | { k: "neg"; a: Node }
  | { k: "not"; a: Node }
  | { k: "and"; a: Node; b: Node }
  | { k: "or"; a: Node; b: Node }
  | { k: "cmp"; op: string; a: Node; b: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

const num = (v: Val): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.length;
  return parseFloat(String(v ?? "")) || 0;
};
const str = (v: Val): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v instanceof Date) return fmtFecha(v);
  if (Array.isArray(v)) return v.map(str).join(", ");
  return String(v);
};
const aLista = (v: Val): Val[] => (Array.isArray(v) ? v : v === null || v === "" ? [] : [v]);

const dos = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" (+" HH:mm" si no es medianoche exacta): legible y ordenable. */
function fmtFecha(d: Date): string {
  const dia = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  return d.getHours() || d.getMinutes() ? `${dia} ${dos(d.getHours())}:${dos(d.getMinutes())}` : dia;
}
/** Cualquier valor a fecha, o null: Date tal cual, string parseable, número = timestamp. */
export function aFecha(v: Val): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string" && v) {
    // Los "YYYY-MM-DD" van por partes: Date.parse los leería en UTC y aquí todo es local.
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return null;
}

const MS_UNIDAD: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
};
const unidad = (s: Val) => str(s).toLowerCase().replace(/s$/, "") + "s"; // admite singular y plural

function dateAdd(d: Date, n: number, u: string): Date {
  const out = new Date(d);
  if (u === "years") out.setFullYear(out.getFullYear() + n);
  else if (u === "quarters") out.setMonth(out.getMonth() + n * 3);
  else if (u === "months") out.setMonth(out.getMonth() + n);
  else out.setTime(out.getTime() + n * (MS_UNIDAD[u] ?? MS_UNIDAD.days));
  return out;
}

function dateBetween(a: Date, b: Date, u: string): number {
  if (u === "years" || u === "quarters" || u === "months") {
    const meses = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    if (u === "years") return Math.trunc(meses / 12);
    if (u === "quarters") return Math.trunc(meses / 3);
    return meses;
  }
  return Math.trunc((a.getTime() - b.getTime()) / (MS_UNIDAD[u] ?? MS_UNIDAD.days));
}

/** formatDate estilo Notion/moment: YYYY YY MMM? no — tokens simples YYYY MM DD HH mm. */
function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, dos(d.getMonth() + 1))
    .replace(/DD/g, dos(d.getDate()))
    .replace(/HH/g, dos(d.getHours()))
    .replace(/mm/g, dos(d.getMinutes()));
}

function evalNode(n: Node, ctx: Ctx): Val {
  switch (n.k) {
    case "num":
      return n.v;
    case "str":
      return n.v;
    case "bool":
      return n.v;
    case "prop":
      return ctx[n.name] ?? null;
    case "neg":
      return -num(evalNode(n.a, ctx));
    case "not":
      return !truthy(evalNode(n.a, ctx));
    case "and":
      return truthy(evalNode(n.a, ctx)) && truthy(evalNode(n.b, ctx));
    case "or":
      return truthy(evalNode(n.a, ctx)) || truthy(evalNode(n.b, ctx));
    case "cmp": {
      const a = evalNode(n.a, ctx);
      const b = evalNode(n.b, ctx);
      const bothNum = typeof a !== "string" && typeof b !== "string";
      if (bothNum) {
        const x = num(a),
          y = num(b);
        switch (n.op) {
          case "==":
            return x === y;
          case "!=":
            return x !== y;
          case ">":
            return x > y;
          case "<":
            return x < y;
          case ">=":
            return x >= y;
          case "<=":
            return x <= y;
        }
      } else {
        const x = str(a),
          y = str(b);
        switch (n.op) {
          case "==":
            return x === y;
          case "!=":
            return x !== y;
          case ">":
            return x > y;
          case "<":
            return x < y;
          case ">=":
            return x >= y;
          case "<=":
            return x <= y;
        }
      }
      return false;
    }
    case "bin": {
      const a = evalNode(n.a, ctx);
      const b = evalNode(n.b, ctx);
      if (n.op === "+" && (typeof a === "string" || typeof b === "string")) return str(a) + str(b);
      const x = num(a),
        y = num(b);
      switch (n.op) {
        case "+":
          return x + y;
        case "-":
          return x - y;
        case "*":
          return x * y;
        case "/":
          return y === 0 ? 0 : x / y;
        case "%":
          return y === 0 ? 0 : x % y;
      }
      return 0;
    }
    case "call": {
      // Formas perezosas: el segundo argumento se evalúa POR ELEMENTO con
      // `current` (y `index`) en el contexto, como en Notion Formula 2.0.
      if (["map", "filter", "find", "findIndex", "some", "every"].includes(n.name)) {
        const lista = aLista(evalNode(n.args[0], ctx));
        const cuerpo = n.args[1];
        const porElemento = (v: Val, i: number): Val =>
          cuerpo ? evalNode(cuerpo, { ...ctx, current: v, index: i }) : v;
        if (n.name === "map") return lista.map(porElemento);
        if (n.name === "filter") return lista.filter((v, i) => truthy(porElemento(v, i)));
        if (n.name === "find") return lista.find((v, i) => truthy(porElemento(v, i))) ?? null;
        if (n.name === "findIndex") return lista.findIndex((v, i) => truthy(porElemento(v, i)));
        if (n.name === "some") return lista.some((v, i) => truthy(porElemento(v, i)));
        return lista.every((v, i) => truthy(porElemento(v, i)));
      }
      const A = n.args.map((a) => evalNode(a, ctx));
      switch (n.name) {
        case "if":
          return truthy(A[0]) ? A[1] ?? null : A[2] ?? null;
        case "round":
          return Math.round(num(A[0]) * 100) / 100;
        case "floor":
          return Math.floor(num(A[0]));
        case "ceil":
          return Math.ceil(num(A[0]));
        case "abs":
          return Math.abs(num(A[0]));
        case "sqrt":
          return Math.sqrt(num(A[0]));
        case "pow":
          return Math.pow(num(A[0]), num(A[1]));
        case "mod":
          return num(A[1]) === 0 ? 0 : num(A[0]) % num(A[1]);
        case "min":
          return Math.min(...A.flatMap(aLista).map(num));
        case "max":
          return Math.max(...A.flatMap(aLista).map(num));
        case "sum":
          return A.flatMap(aLista).reduce<number>((a, v) => a + num(v), 0);
        case "mean": {
          const xs = A.flatMap(aLista);
          return xs.length ? xs.reduce<number>((a, v) => a + num(v), 0) / xs.length : 0;
        }
        case "toNumber": {
          const x = parseFloat(str(A[0]).replace(",", "."));
          return Number.isFinite(x) ? x : null;
        }
        // --- texto ---
        case "concat":
          // Con listas concatena listas (Notion 2.0); con escalares, texto (compat).
          return A.some(Array.isArray) ? A.flatMap(aLista) : A.map(str).join("");
        case "length":
          return Array.isArray(A[0]) ? A[0].length : str(A[0]).length;
        case "upper":
          return str(A[0]).toUpperCase();
        case "lower":
          return str(A[0]).toLowerCase();
        case "trim":
          return str(A[0]).trim();
        case "contains":
          return Array.isArray(A[0])
            ? A[0].some((v) => str(v) === str(A[1]))
            : str(A[0]).toLowerCase().includes(str(A[1]).toLowerCase());
        case "startsWith":
          return str(A[0]).startsWith(str(A[1]));
        case "endsWith":
          return str(A[0]).endsWith(str(A[1]));
        case "substring":
          return str(A[0]).slice(num(A[1]), A[2] === undefined ? undefined : num(A[2]));
        case "replace":
          return str(A[0]).replace(new RegExp(str(A[1])), str(A[2]));
        case "replaceAll":
          return str(A[0]).replace(new RegExp(str(A[1]), "g"), str(A[2]));
        case "test":
          return new RegExp(str(A[1])).test(str(A[0]));
        case "split":
          return str(A[0]).split(str(A[1] ?? ","));
        case "format":
          return str(A[0]);
        case "empty":
          return A[0] === null || A[0] === "" || (Array.isArray(A[0]) && A[0].length === 0);
        case "coalesce":
          return A.find((v) => v !== null && v !== undefined && v !== "") ?? null;
        // --- listas ---
        case "join":
          return aLista(A[0]).map(str).join(A[1] === undefined ? ", " : str(A[1]));
        case "unique": {
          const vistos = new Set<string>();
          return aLista(A[0]).filter((v) => {
            const k = JSON.stringify(v instanceof Date ? v.getTime() : v);
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
        }
        case "sort": {
          const xs = [...aLista(A[0])];
          return xs.every((v) => typeof v === "number")
            ? xs.sort((a, b) => num(a) - num(b))
            : xs.sort((a, b) => str(a).localeCompare(str(b)));
        }
        case "reverse":
          return [...aLista(A[0])].reverse();
        case "first":
          return aLista(A[0])[0] ?? null;
        case "last":
          return aLista(A[0]).at(-1) ?? null;
        case "at":
          return aLista(A[0])[num(A[1])] ?? null;
        case "slice":
          return aLista(A[0]).slice(num(A[1]), A[2] === undefined ? undefined : num(A[2]));
        case "includes":
          return aLista(A[0]).some((v) => str(v) === str(A[1]));
        // --- fecha ---
        case "now":
          return new Date();
        case "today": {
          const d = new Date();
          return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        }
        case "parseDate":
        case "toDate":
          return aFecha(A[0]);
        case "year":
          return aFecha(A[0])?.getFullYear() ?? null;
        case "month":
          return aFecha(A[0]) ? aFecha(A[0])!.getMonth() + 1 : null;
        case "date":
          return aFecha(A[0])?.getDate() ?? null;
        case "day":
          return aFecha(A[0])?.getDay() ?? null; // 0 = domingo, como en Notion
        case "hour":
          return aFecha(A[0])?.getHours() ?? null;
        case "minute":
          return aFecha(A[0])?.getMinutes() ?? null;
        case "timestamp":
          return aFecha(A[0])?.getTime() ?? null;
        case "fromTimestamp":
          return new Date(num(A[0]));
        case "dateAdd": {
          const d = aFecha(A[0]);
          return d ? dateAdd(d, num(A[1]), unidad(A[2])) : null;
        }
        case "dateSubtract": {
          const d = aFecha(A[0]);
          return d ? dateAdd(d, -num(A[1]), unidad(A[2])) : null;
        }
        case "dateBetween": {
          const a = aFecha(A[0]);
          const b = aFecha(A[1]);
          return a && b ? dateBetween(a, b, unidad(A[2])) : null;
        }
        case "formatDate": {
          const d = aFecha(A[0]);
          return d ? formatDate(d, str(A[1] || "YYYY-MM-DD")) : "";
        }
        default:
          throw new Error("Función desconocida: " + n.name);
      }
    }
  }
}

function truthy(v: Val): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "";
  if (v instanceof Date) return true;
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

/**
 * Evalúa una expresión de fórmula contra el contexto (campo -> valor) y devuelve
 * algo mostrable (las fechas y listas salen como texto). Nunca lanza al llamador.
 */
export function evalFormula(expr: string, ctx: Ctx): number | string | boolean | null {
  try {
    if (!expr || !expr.trim()) return "";
    const ast = new Parser(tokenize(expr)).parse();
    const out = evalNode(ast, ctx);
    if (typeof out === "number") return Math.round(out * 10000) / 10000;
    if (typeof out === "boolean") return out ? "Sí" : "No";
    if (out instanceof Date || Array.isArray(out)) return str(out);
    return out;
  } catch {
    return "⚠️ fórmula";
  }
}
