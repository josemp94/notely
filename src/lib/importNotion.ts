import { unzipSync, strFromU8 } from "fflate";
import { BlockNoteEditor } from "@blocknote/core";
import { parseCsv } from "./csv";
import { dedupCsvs, limpiaNombre, reescribeEnlaces } from "./notionMd";
import { subirArchivo } from "@/components/editor/mention";

/**
 * Importa el ZIP de export de Notion (formato «Markdown y CSV»), en el navegador:
 * descomprime, crea las páginas respetando la jerarquía de carpetas, convierte los
 * CSV en bases de datos, sube los adjuntos a /api/upload y reescribe los enlaces
 * del Markdown (adjuntos → URL subida, páginas → /p/<id>) antes de parsearlo.
 *
 * Limitaciones deliberadas: los .md dentro de la carpeta de una BD (el contenido de
 * cada fila) se omiten —las filas ya vienen en el CSV— y todo llega como texto (la
 * detección de tipos vive en el servidor, en importCsv).
 */

type Api = {
  createPage: (i: { parentId: string | null; title: string }) => Promise<{ id: string }>;
  updateContent: (i: { id: string; content: unknown }) => Promise<unknown>;
  importCsv: (i: { parentId: string | null; name: string; headers: string[]; rows: string[][] }) => Promise<{ id: string }>;
  onProgress?: (msg: string) => void;
};

export type ResumenImport = {
  rootId: string | null;
  paginas: number;
  bases: number;
  adjuntos: number;
  omitidos: number;
};

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|desktop\.ini$)/;

const nombreBase = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const carpetaDe = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export async function importNotionZip(file: File, api: Api): Promise<ResumenImport> {
  const avisa = api.onProgress ?? (() => {});
  avisa("Descomprimiendo…");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));

  const paths = Object.keys(zip)
    .filter((p) => !p.endsWith("/") && !JUNK.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));

  const mds = paths.filter((p) => /\.md$/i.test(p));
  const csvs = dedupCsvs(paths.filter((p) => /\.csv$/i.test(p)));
  if (!mds.length && !csvs.length) {
    throw new Error("El ZIP no trae .md ni .csv. Exporta desde Notion en formato «Markdown y CSV».");
  }

  let omitidos = 0;

  // 1) Adjuntos: todo lo que no es md/csv se sube tal cual y se apunta su URL.
  const urlDe = new Map<string, string>();
  const adjuntos = paths.filter((p) => !/\.(md|csv)$/i.test(p));
  for (const [i, p] of adjuntos.entries()) {
    avisa(`Subiendo adjuntos… ${i + 1}/${adjuntos.length}`);
    try {
      const subido = await subirArchivo(new File([zip[p] as BlobPart], nombreBase(p)));
      urlDe.set(p, subido.props.url);
    } catch {
      omitidos++; // demasiado grande o rechazado: el enlace se queda como estaba
    }
  }

  // 2) Páginas y BDs, de arriba abajo (las carpetas ya tienen dueño al llegar los hijos).
  // La carpeta «A b3f/» corresponde al fichero «A b3f.md» (o .csv): misma clave sin extensión.
  const duenoDeCarpeta = new Map<string, string>(); // ruta de carpeta → pageId
  const idDePagina = new Map<string, string>(); // ruta del .md/.csv → pageId
  const esCarpetaDeBd = new Set<string>();
  let rootId: string | null = null;
  let paginas = 0;
  let bases = 0;

  /** Padre de una entrada; crea páginas contenedor para carpetas sin fichero propio. */
  const padreDe = async (dir: string): Promise<string | null> => {
    if (!dir) return null;
    const ya = duenoDeCarpeta.get(dir);
    if (ya) return ya;
    const abuelo = await padreDe(carpetaDe(dir));
    const creada = await api.createPage({ parentId: abuelo, title: limpiaNombre(nombreBase(dir)) });
    duenoDeCarpeta.set(dir, creada.id);
    paginas++;
    return creada.id;
  };

  const ficheros = [...mds, ...csvs].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
  for (const [i, p] of ficheros.entries()) {
    const dir = carpetaDe(p);
    // El contenido de cada fila de una BD (.md dentro de su carpeta) se omite: las
    // filas ya vienen en el CSV y aquí no hay con qué casarlas.
    if (/\.md$/i.test(p) && esCarpetaDeBd.has(dir)) {
      omitidos++;
      continue;
    }
    avisa(`Creando páginas… ${i + 1}/${ficheros.length}`);
    const parentId = await padreDe(dir);
    const titulo = limpiaNombre(nombreBase(p).replace(/\.(md|csv)$/i, ""));
    const claveCarpeta = p.replace(/(_all)?\.(md|csv)$/i, "");
    if (/\.csv$/i.test(p)) {
      const filas = parseCsv(strFromU8(zip[p]));
      if (!filas.length) {
        omitidos++;
        continue;
      }
      const page = await api.importCsv({ parentId, name: titulo, headers: filas[0], rows: filas.slice(1) });
      idDePagina.set(p, page.id);
      duenoDeCarpeta.set(claveCarpeta, page.id);
      esCarpetaDeBd.add(claveCarpeta);
      bases++;
      rootId ??= page.id;
    } else {
      const page = await api.createPage({ parentId, title: titulo });
      idDePagina.set(p, page.id);
      duenoDeCarpeta.set(claveCarpeta, page.id);
      paginas++;
      rootId ??= page.id;
    }
  }

  // 3) Contenido: reescribir enlaces y parsear el Markdown.
  const conContenido = mds.filter((p) => !(/\.md$/i.test(p) && esCarpetaDeBd.has(carpetaDe(p))));
  for (const [i, p] of conContenido.entries()) {
    avisa(`Convirtiendo contenido… ${i + 1}/${conContenido.length}`);
    const dir = carpetaDe(p);
    let texto = strFromU8(zip[p]);
    // Notion pone el título como «# Título» en la primera línea: fuera, ya es el título de la página.
    texto = texto.replace(/^# .*\r?\n+/, "");
    texto = reescribeEnlaces(texto, dir, (ruta) => {
      const adjunto = urlDe.get(ruta);
      if (adjunto) return adjunto;
      const pagina = idDePagina.get(ruta) ?? idDePagina.get(ruta.replace(/\.csv$/i, "_all.csv"));
      return pagina ? `/p/${pagina}` : null;
    });
    const id = idDePagina.get(p)!;
    const blocks = BlockNoteEditor.create().tryParseMarkdownToBlocks(texto);
    if (blocks.length) await api.updateContent({ id, content: blocks });
  }

  return { rootId, paginas, bases, adjuntos: urlDe.size, omitidos };
}
