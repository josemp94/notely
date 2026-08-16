// Evaluador seguro de fórmulas (sin eval). Subconjunto estilo Notion.
// Soporta: prop("Campo"), números, cadenas "..", true/false,
//   + - * / %, comparaciones (== != > < >= <=), and/or/not, paréntesis,
//   y funciones: if, round, floor, ceil, abs, min, max, concat, length,
//   upper, lower, contains, coalesce.

type Val = number | string | boolean | null;
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

const num = (v: Val): number => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : parseFloat(String(v ?? "")) || 0);
const str = (v: Val): string => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v));

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
        case "min":
          return Math.min(...A.map(num));
        case "max":
          return Math.max(...A.map(num));
        case "concat":
          return A.map(str).join("");
        case "length":
          return str(A[0]).length;
        case "upper":
          return str(A[0]).toUpperCase();
        case "lower":
          return str(A[0]).toLowerCase();
        case "contains":
          return str(A[0]).toLowerCase().includes(str(A[1]).toLowerCase());
        case "coalesce":
          return A.find((v) => v !== null && v !== undefined && v !== "") ?? null;
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
  return false;
}

/** Evalúa una expresión de fórmula contra el contexto (campo -> valor). Nunca lanza al llamador. */
export function evalFormula(expr: string, ctx: Ctx): Val {
  try {
    if (!expr || !expr.trim()) return "";
    const ast = new Parser(tokenize(expr)).parse();
    const out = evalNode(ast, ctx);
    if (typeof out === "number") return Math.round(out * 10000) / 10000;
    if (typeof out === "boolean") return out ? "Sí" : "No";
    return out;
  } catch {
    return "⚠️ fórmula";
  }
}
