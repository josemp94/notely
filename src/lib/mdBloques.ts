/**
 * Markdown → bloques BlockNote en el servidor (el parser de BlockNote solo
 * corre en navegador). Cubre lo que un agente externo suele mandar: encabezados
 * #/##/###, párrafos, listas -/* y numeradas, y estilos en línea (negrita,
 * cursiva, código y enlaces). Pieza pura sin dependencias; se prueba en
 * scripts/check.ts.
 */

type Inline =
  | { type: "text"; text: string; styles: Record<string, boolean> }
  | { type: "link"; href: string; content: Inline[] };

export type BloqueMd = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content: Inline[];
  children: never[];
};

const txt = (text: string, styles: Record<string, boolean>): Inline => ({ type: "text", text, styles });

// **negrita** | *cursiva* | _cursiva_ | `código` | [texto](url) — el ** va antes
// que el * para que la alternancia no parta la negrita en dos cursivas, y su
// cierre es «** sin otro * detrás» para que `**a *b***` anide bien.
const RE_INLINE =
  /\*\*(.+?)\*\*(?!\*)|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^()\s]+)\)/;

function inline(texto: string, estilos: Record<string, boolean> = {}): Inline[] {
  const out: Inline[] = [];
  let resto = texto;
  while (resto) {
    const m = RE_INLINE.exec(resto);
    if (!m) {
      out.push(txt(resto, estilos));
      break;
    }
    if (m.index > 0) out.push(txt(resto.slice(0, m.index), estilos));
    const [, negrita, cursiva, cursiva2, codigo, enlaceTxt, enlaceUrl] = m;
    if (negrita !== undefined) out.push(...inline(negrita, { ...estilos, bold: true }));
    else if (cursiva !== undefined) out.push(...inline(cursiva, { ...estilos, italic: true }));
    else if (cursiva2 !== undefined) out.push(...inline(cursiva2, { ...estilos, italic: true }));
    else if (codigo !== undefined) out.push(txt(codigo, { ...estilos, code: true }));
    else out.push({ type: "link", href: enlaceUrl, content: inline(enlaceTxt, estilos) });
    resto = resto.slice(m.index + m[0].length);
  }
  return out;
}

const bloque = (type: string, props: Record<string, unknown>, texto: string): BloqueMd => ({
  id: crypto.randomUUID(),
  type,
  props,
  content: inline(texto),
  children: [],
});

/** Convierte un Markdown a la lista de bloques que guarda Record.content / Page.content. */
export function markdownABloques(md: string): BloqueMd[] {
  const bloques: BloqueMd[] = [];
  let parrafo: string[] = [];
  const cierra = () => {
    if (parrafo.length) bloques.push(bloque("paragraph", {}, parrafo.join(" ")));
    parrafo = [];
  };
  for (const linea of md.replace(/\r\n?/g, "\n").split("\n")) {
    const l = linea.trim();
    let m: RegExpExecArray | null;
    if (!l) cierra();
    else if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      cierra();
      bloques.push(bloque("heading", { level: Math.min(3, m[1].length) }, m[2]));
    } else if ((m = /^[-*]\s+(.*)$/.exec(l))) {
      cierra();
      bloques.push(bloque("bulletListItem", {}, m[1]));
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(l))) {
      cierra();
      bloques.push(bloque("numberedListItem", {}, m[1]));
    } else parrafo.push(l);
  }
  cierra();
  return bloques;
}
