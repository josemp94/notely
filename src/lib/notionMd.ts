/**
 * Piezas puras del import de Notion (sin BlockNote ni React): nombres, rutas y
 * reescritura de enlaces del Markdown. Se prueban en scripts/check.ts.
 */

/** Quita el id hex de 32 que Notion pega al final de cada nombre (y el sufijo _all de los CSV). */
export const limpiaNombre = (s: string) =>
  s.replace(/(\s+[0-9a-f]{32})?(_all)?$/i, "").trim() || "Sin título";

/** Resuelve un enlace relativo del Markdown contra la carpeta del fichero. */
export function resolver(dir: string, target: string): string {
  const partes = (dir ? dir.split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of partes) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

/**
 * Reescribe los destinos `](…)` de un Markdown: decodifica el %20 de Notion, lo
 * resuelve contra la carpeta del fichero y pregunta al callback por el destino
 * nuevo (URL del adjunto subido o /p/<id> de la página). Si no hay respuesta, el
 * enlace se queda como estaba. Los enlaces absolutos (http…) no se tocan.
 */
export function reescribeEnlaces(
  texto: string,
  dir: string,
  destino: (ruta: string) => string | null,
): string {
  return texto.replace(/\]\(([^()\s]+)\)/g, (todo, target: string) => {
    if (/^[a-z]+:/i.test(target)) return todo; // http:, https:, mailto:…
    let ruta: string;
    try {
      ruta = resolver(dir, decodeURIComponent(target.split("#")[0]));
    } catch {
      return todo;
    }
    const nuevo = destino(ruta);
    return nuevo ? `](${nuevo})` : todo;
  });
}

/**
 * Notion exporta cada BD dos veces: «X <id>.csv» (la vista) y «X <id>_all.csv»
 * (todas las filas). Si están las dos, se queda la _all.
 */
export function dedupCsvs(csvs: string[]): string[] {
  const conAll = new Set(
    csvs.filter((p) => /_all\.csv$/i.test(p)).map((p) => p.replace(/_all\.csv$/i, "")),
  );
  return csvs.filter((p) => /_all\.csv$/i.test(p) || !conAll.has(p.replace(/\.csv$/i, "")));
}
