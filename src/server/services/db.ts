/**
 * Lógica de bases de datos, sin tRPC ni HTTP delante.
 *
 * La usan DOS entradas: el router tRPC (sesión de navegador) y la API REST v1
 * (token). Antes cada una traía su copia —la de crear registros, por ejemplo, vivía
 * duplicada y ya había divergido: la de REST no disparaba webhooks ni apuntaba quién
 * lo creó—. Con una sola copia eso no puede volver a pasar.
 *
 * Todo recibe el ámbito explícito (`workspaceId`, y `userId` cuando hay alguien
 * detrás) en vez de leerlo de un contexto: es lo que permite llamarlo desde una
 * petición con token, donde no hay sesión.
 */
import type { Prisma } from "@prisma/client";
import { db as defaultDb } from "@/lib/db";
import { rankAtEnd, rankBetween } from "@/lib/fractional";
import { dispatchWebhooks } from "@/server/webhooks";
import { cellToText } from "./cells";

type DB = typeof defaultDb;

/** Quién pide la operación y sobre qué espacio. `userId` falta si viene por token. */
export type Scope = { db: DB; workspaceId: string; userId?: string | null };

export const FIELD_TYPES = [
  "text", "number", "select", "multiselect", "status", "person", "files", "checkbox",
  "date", "url", "email", "phone", "created_time", "last_edited_time", "created_by",
  "last_edited_by", "id",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const VIEW_TYPES = [
  "table", "kanban", "calendar", "timeline", "gallery", "chart", "list", "form",
] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

/**
 * Error con la intención, no con el transporte: cada entrada lo traduce a lo suyo
 * (tRPC a NOT_FOUND/BAD_REQUEST, REST a 404/400). Así el servicio no sabe si lo
 * llaman por HTTP o por tRPC.
 */
export class DbError extends Error {
  constructor(
    readonly code: "not_found" | "bad_request",
    message: string,
  ) {
    super(message);
    this.name = "DbError";
  }
}

const noEncontrado = (que: string) => new DbError("not_found", `${que} no encontrada.`);

/** La colección tiene que ser del espacio del que pide: si no, no existe para él. */
export async function assertCollection(scope: Scope, collectionId: string) {
  const c = await scope.db.collection.findFirst({
    where: { id: collectionId, page: { workspaceId: scope.workspaceId } },
    select: { id: true },
  });
  if (!c) throw noEncontrado("Base de datos");
  return c;
}

async function assertField(scope: Scope, fieldId: string) {
  const f = await scope.db.field.findFirst({
    where: { id: fieldId, collection: { page: { workspaceId: scope.workspaceId } } },
  });
  if (!f) throw noEncontrado("Columna");
  return f;
}

async function assertView(scope: Scope, viewId: string) {
  const v = await scope.db.view.findFirst({
    where: { id: viewId, collection: { page: { workspaceId: scope.workspaceId } } },
    select: { id: true, collectionId: true },
  });
  if (!v) throw noEncontrado("Vista");
  return v;
}

/** Config de partida de un campo recién creado, según su tipo. */
export function defaultFieldConfig(type: FieldType): Prisma.InputJsonValue {
  if (type === "status") {
    return {
      options: [
        { id: "st_todo", label: "Sin empezar", color: "gray", group: "todo" },
        { id: "st_doing", label: "En curso", color: "blue", group: "doing" },
        { id: "st_done", label: "Hecho", color: "green", group: "done" },
      ],
    };
  }
  if (type === "select" || type === "multiselect") return { options: [] };
  return {};
}

const NOMBRES_VISTA: Record<ViewType, string> = {
  table: "Tabla",
  kanban: "Kanban",
  calendar: "Calendario",
  gallery: "Galería",
  chart: "Gráfica",
  list: "Lista",
  form: "Formulario",
  timeline: "Cronograma",
};

/**
 * Config de partida de una vista: elige por su cuenta el campo del que colgar
 * (columnas del Kanban, fecha del calendario…), o la vista nacería sin nada que
 * mostrar.
 */
export function defaultViewConfig(type: ViewType, fields: { id: string; type: string }[]): Prisma.InputJsonValue {
  const primeroDe = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
  if (type === "kanban") {
    return { groupByFieldId: primeroDe("select") ?? primeroDe("status") ?? primeroDe("person") };
  }
  if (type === "calendar" || type === "timeline") return { dateFieldId: primeroDe("date") };
  if (type === "chart") {
    return { chartType: "bar", xFieldId: primeroDe("select"), yFieldId: null, agg: "count" };
  }
  return {};
}

// --- Bases de datos ---------------------------------------------------------

export type NuevaColumna = { name: string; type: FieldType };
export type NuevaVista = { type: ViewType; name?: string };

/**
 * Crea una base de datos entera: su página, la colección, las columnas y las vistas.
 *
 * `seedRows` son las filas vacías con las que nace. La app pone 3, como Notion, para
 * que la tabla no aparezca desierta; quien la crea por API normalmente quiere la
 * estructura y nada más, y pide 0.
 */
export async function createDatabase(
  scope: Scope,
  input: {
    title: string;
    parentId?: string | null;
    icon?: string | null;
    fields?: NuevaColumna[];
    views?: NuevaVista[];
    seedRows?: number;
    /** Las embebidas cuelgan de una página oculta, fuera del árbol y de la búsqueda. */
    embedded?: boolean;
  },
) {
  if (input.parentId) {
    const padre = await scope.db.page.findFirst({
      where: { id: input.parentId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!padre) throw noEncontrado("Página madre");
  }

  const last = await scope.db.page.findFirst({
    where: { workspaceId: scope.workspaceId, parentId: input.parentId ?? null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const page = await scope.db.page.create({
    data: {
      workspaceId: scope.workspaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      icon: input.icon ?? "🗃️",
      type: "database",
      embedded: input.embedded ?? false,
      order: rankAtEnd(last?.order ?? null),
      content: [],
    },
  });

  const collection = await scope.db.collection.create({ data: { pageId: page.id, name: input.title } });

  // Sin columnas pedidas, una de texto: una base de datos sin ninguna no se puede usar.
  const columnas: NuevaColumna[] = input.fields?.length ? input.fields : [{ name: "Nombre", type: "text" }];
  const fields = [];
  let ordenCampo: string | null = null;
  for (const c of columnas) {
    ordenCampo = rankAtEnd(ordenCampo);
    fields.push(
      await scope.db.field.create({
        data: {
          collectionId: collection.id,
          name: c.name,
          type: c.type,
          order: ordenCampo,
          config: defaultFieldConfig(c.type),
        },
      }),
    );
  }

  const vistas: NuevaVista[] = input.views?.length ? input.views : [{ type: "table" }];
  const views = [];
  for (const v of vistas) {
    views.push(
      await scope.db.view.create({
        data: {
          collectionId: collection.id,
          name: v.name?.trim() || NOMBRES_VISTA[v.type],
          type: v.type,
          config: defaultViewConfig(v.type, fields),
        },
      }),
    );
  }

  let ordenFila: string | null = null;
  for (let i = 0; i < (input.seedRows ?? 0); i++) {
    ordenFila = rankAtEnd(ordenFila);
    await scope.db.record.create({
      data: { collectionId: collection.id, order: ordenFila, seq: i + 1, cells: {} },
    });
  }

  return { page, collection, fields, views };
}

// --- Columnas ---------------------------------------------------------------

export async function addField(
  scope: Scope,
  input: { collectionId: string; name: string; type: FieldType },
) {
  await assertCollection(scope, input.collectionId);
  const last = await scope.db.field.findFirst({
    where: { collectionId: input.collectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return scope.db.field.create({
    data: {
      collectionId: input.collectionId,
      name: input.name,
      type: input.type,
      order: rankAtEnd(last?.order ?? null),
      config: defaultFieldConfig(input.type),
    },
  });
}

export async function updateField(
  scope: Scope,
  input: { id: string; name?: string; config?: unknown },
) {
  await assertField(scope, input.id);
  return scope.db.field.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
    },
  });
}

/**
 * Duplica una columna con su configuración y sus valores, pegada a la original.
 * Si era la mitad de una relación bidireccional, la copia queda como relación
 * normal: dos campos sincronizando contra el mismo espejo se pisarían.
 */
export async function duplicateField(scope: Scope, input: { id: string }) {
  const src = await assertField(scope, input.id);
  const { mirrorFieldId: _fuera, ...config } = (src.config ?? {}) as Record<string, unknown>;
  const next = await scope.db.field.findFirst({
    where: { collectionId: src.collectionId, order: { gt: src.order } },
    orderBy: { order: "asc" },
    select: { order: true },
  });
  const copia = await scope.db.field.create({
    data: {
      collectionId: src.collectionId,
      name: `${src.name} (copia)`,
      type: src.type,
      order: rankBetween(src.order, next?.order ?? null),
      config: config as Prisma.InputJsonValue,
    },
  });
  // Los valores, en una sola sentencia (también en filas archivadas: al restaurarlas
  // deben venir completas). rollup/formula no guardan celda, así que no copian nada.
  await scope.db.$executeRaw`
    UPDATE "Record" SET cells = cells || jsonb_build_object(${copia.id}::text, cells -> ${src.id}::text)
    WHERE "collectionId" = ${src.collectionId} AND cells ? ${src.id}::text
  `;
  return copia;
}

export async function deleteField(scope: Scope, input: { id: string }) {
  const field = await assertField(scope, input.id);
  await scope.db.field.delete({ where: { id: input.id } });
  // Si era la mitad de una relación bidireccional, el espejo queda como relación
  // normal (se le quita el emparejamiento para que nadie sincronice contra un
  // campo que ya no existe).
  const mirrorFieldId = (field.config as { mirrorFieldId?: string } | null)?.mirrorFieldId;
  if (mirrorFieldId) {
    const espejo = await scope.db.field.findUnique({ where: { id: mirrorFieldId }, select: { config: true } });
    if (espejo) {
      const { mirrorFieldId: _fuera, ...resto } = (espejo.config ?? {}) as Record<string, unknown>;
      await scope.db.field.update({ where: { id: mirrorFieldId }, data: { config: resto as object } });
    }
  }
  return { ok: true as const };
}

/**
 * Cambia el tipo de una columna ya creada, convirtiendo lo que se pueda de cada
 * celda. No se entra ni se sale de relation/rollup/formula: su valor no vive en la
 * celda, se calcula.
 */
export async function setFieldType(scope: Scope, input: { id: string; type: FieldType }) {
  const field = await assertField(scope, input.id);
  if (["relation", "rollup", "formula"].includes(field.type)) {
    throw new DbError("bad_request", "Ese tipo de columna no se puede convertir.");
  }
  if (field.type === input.type) return { ok: true as const, converted: 0 };

  const records = await scope.db.record.findMany({
    where: { collectionId: field.collectionId, archivedAt: null },
    select: { id: true, cells: true, createdAt: true, updatedAt: true, seq: true },
  });

  // Texto de partida de cada celda; de ahí se deriva el valor en el tipo nuevo.
  const texts = new Map<string, string>();
  for (const r of records) {
    const cells = (r.cells ?? {}) as Record<string, unknown>;
    texts.set(r.id, cellToText(field, cells[field.id], r));
  }

  // Al pasar a etiquetas, cada texto distinto se convierte en una opción.
  const options: { id: string; label: string; color: string }[] = [];
  const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "default"];
  const optionFor = (label: string) => {
    const found = options.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (found) return found.id;
    const id = "opt_" + Math.random().toString(36).slice(2, 9);
    options.push({ id, label, color: COLORS[options.length % COLORS.length] });
    return id;
  };

  const convert = (text: string): unknown => {
    if (!text) return null;
    switch (input.type) {
      case "text":
      case "url":
      case "email":
      case "phone":
        return text;
      case "number": {
        const n = Number(text.replace(/[^\d,.-]/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }
      case "checkbox":
        return !["", "false", "no", "0"].includes(text.trim().toLowerCase());
      case "date": {
        const iso = text.match(/\d{4}-\d{2}-\d{2}/);
        return iso ? iso[0] : null;
      }
      case "select":
      case "status":
        return optionFor(text);
      case "multiselect":
        return text.split(",").map((part) => optionFor(part.trim())).filter(Boolean);
      default:
        // person, files, id, created_time/by, last_edited_time/by: se rellenan solos.
        return null;
    }
  };

  await scope.db.$transaction(async (tx) => {
    for (const r of records) {
      const cells = { ...((r.cells ?? {}) as Record<string, unknown>) };
      const next = convert(texts.get(r.id) ?? "");
      if (next === null || (Array.isArray(next) && !next.length)) delete cells[field.id];
      else cells[field.id] = next;
      await tx.record.update({ where: { id: r.id }, data: { cells: cells as Prisma.InputJsonValue } });
    }
    // La config vieja (opciones, formato, prefijo) no vale para el tipo nuevo.
    await tx.field.update({
      where: { id: field.id },
      data: { type: input.type, config: options.length ? { options } : {} },
    });
  });
  return { ok: true as const, converted: records.length };
}

// --- Vistas -----------------------------------------------------------------

export async function addView(
  scope: Scope,
  input: { collectionId: string; type: ViewType; name?: string },
) {
  await assertCollection(scope, input.collectionId);
  const fields = await scope.db.field.findMany({
    where: { collectionId: input.collectionId },
    orderBy: { order: "asc" },
  });
  return scope.db.view.create({
    data: {
      collectionId: input.collectionId,
      name: input.name?.trim() || NOMBRES_VISTA[input.type],
      type: input.type,
      config: defaultViewConfig(input.type, fields),
    },
  });
}

export async function renameView(scope: Scope, input: { id: string; name: string }) {
  await assertView(scope, input.id);
  return scope.db.view.update({ where: { id: input.id }, data: { name: input.name.trim() } });
}

export async function deleteView(scope: Scope, input: { id: string }) {
  const v = await assertView(scope, input.id);
  const count = await scope.db.view.count({ where: { collectionId: v.collectionId } });
  if (count <= 1) throw new DbError("bad_request", "No puedes borrar la última vista.");
  await scope.db.view.delete({ where: { id: input.id } });
  return { ok: true as const };
}

// --- Registros --------------------------------------------------------------

/**
 * Crea un registro. Avisa a los webhooks y apunta quién lo creó: por REST esto no
 * pasaba, porque esa ruta traía su propia copia de la lógica.
 */
export async function createRecord(
  scope: Scope,
  input: { collectionId: string; cells?: Record<string, unknown>; parentId?: string | null },
) {
  await assertCollection(scope, input.collectionId);

  if (input.parentId) {
    const padre = await scope.db.record.findFirst({
      where: { id: input.parentId, collectionId: input.collectionId },
      select: { id: true },
    });
    if (!padre) throw new DbError("bad_request", "parentId no pertenece a esta base de datos.");
  }

  const last = await scope.db.record.findFirst({
    where: { collectionId: input.collectionId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const maxSeq = await scope.db.record.aggregate({
    where: { collectionId: input.collectionId },
    _max: { seq: true },
  });

  const created = await scope.db.record.create({
    data: {
      collectionId: input.collectionId,
      parentId: input.parentId ?? null,
      order: rankAtEnd(last?.order ?? null),
      seq: (maxSeq._max.seq ?? 0) + 1,
      cells: (input.cells ?? {}) as Prisma.InputJsonValue,
      createdById: scope.userId ?? null,
      updatedById: scope.userId ?? null,
    },
  });

  dispatchWebhooks(scope.workspaceId, "record.created", {
    recordId: created.id,
    collectionId: input.collectionId,
    cells: created.cells,
  });
  return created;
}
