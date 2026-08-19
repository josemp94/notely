import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd, rankBetween } from "@/lib/fractional";
import { toCsv } from "@/lib/csv";
import { evalFormula } from "../formula";
import { dateValue, dayOf } from "@/lib/cellText";

// Tipos de campo soportados en Fase 2
export const FIELD_TYPES = ["text", "number", "select", "multiselect", "status", "person", "files", "checkbox", "date", "url", "email", "phone", "created_time", "last_edited_time", "created_by", "last_edited_by", "id"] as const;

/** Valor de una celda como texto plano (export CSV y vista pública). */
export function cellToText(
  f: { type: string; config: unknown },
  v: unknown,
  r: { createdAt: Date; updatedAt: Date; seq: number | null; createdById?: string | null; updatedById?: string | null },
  /** userId -> nombre, para los campos de tipo "person" (ver peopleOf). */
  people?: Map<string, string>,
): string {
  if (f.type === "created_time") return r.createdAt.toISOString();
  if (f.type === "last_edited_time") return r.updatedAt.toISOString();
  if (f.type === "id") return r.seq == null ? "" : String(r.seq);
  if (f.type === "created_by" || f.type === "last_edited_by") {
    const uid = f.type === "created_by" ? r.createdById : r.updatedById;
    return uid ? (people?.get(uid) ?? uid) : "";
  }
  if (v === undefined || v === null || v === "") return "";
  const opts = ((f.config as { options?: { id: string; label: string }[] })?.options) ?? [];
  if (f.type === "select" || f.type === "status") return opts.find((o) => o.id === v)?.label ?? String(v);
  if (f.type === "multiselect")
    return (Array.isArray(v) ? v : [v]).map((x) => opts.find((o) => o.id === x)?.label ?? String(x)).join(", ");
  if (f.type === "files")
    return (Array.isArray(v) ? v : []).map((x) => (x as { name?: string })?.name ?? "").filter(Boolean).join(", ");
  if (f.type === "person")
    return (Array.isArray(v) ? v : [v]).map((x) => people?.get(String(x)) ?? String(x)).join(", ");
  // ISO a propósito: el CSV debe poder reimportarse y abrirse en una hoja de cálculo.
  if (f.type === "date") {
    const d = dateValue(v);
    return d ? (d.end ? `${d.start} → ${d.end}` : d.start) : "";
  }
  if (f.type === "checkbox") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

/** Mapa userId -> nombre de los miembros del espacio; vacío si la BD no usa campos "person". */
export async function peopleOf(
  db: typeof import("@/lib/db").db,
  workspaceId: string,
  fields: { type: string }[],
): Promise<Map<string, string>> {
  if (!fields.some((f) => ["person", "created_by", "last_edited_by"].includes(f.type))) return new Map();
  const ms = await db.member.findMany({
    where: { workspaceId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return new Map(ms.map((m) => [m.user.id, m.user.name || m.user.email]));
}

/** Colección recién nacida, como en Notion: campo "Nombre", vista Tabla y 3 filas vacías. */
async function seedCollection(db: typeof import("@/lib/db").db, pageId: string, name: string) {
  const collection = await db.collection.create({ data: { pageId, name } });
  await db.field.create({
    data: { collectionId: collection.id, name: "Nombre", type: "text", order: rankAtEnd(null), config: {} },
  });
  await db.view.create({
    data: { collectionId: collection.id, name: "Tabla", type: "table", config: {} },
  });
  let ord: string | null = null;
  for (let i = 0; i < 3; i++) {
    ord = rankAtEnd(ord);
    await db.record.create({
      data: { collectionId: collection.id, order: ord, seq: i + 1, cells: {} },
    });
  }
  return collection;
}

async function assertPage(ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } }, pageId: string) {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
}

async function assertCollection(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  collectionId: string,
) {
  const c = await ctx.db.collection.findFirst({
    where: { id: collectionId, page: { workspaceId: ctx.workspace.id } },
    select: { id: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
  return c;
}

export const dbRouter = router({
  /** Crea una página de tipo base de datos, con colección, campos, vistas y filas de ejemplo. */
  create: workspaceProcedure
    .input(z.object({ parentId: z.string().nullish(), title: z.string().default("Base de datos") }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const page = await ctx.db.page.create({
        data: {
          workspaceId: ctx.workspace.id,
          parentId: input.parentId ?? null,
          title: input.title,
          icon: "🗃️",
          type: "database",
          order: rankAtEnd(last?.order ?? null),
          content: [],
        },
      });
      await seedCollection(ctx.db, page.id, input.title);
      return page;
    }),

  /**
   * Crea una BD para embeber en el cuerpo de una página: la Collection cuelga de una
   * página contenedora oculta (embedded=true, excluida del árbol y de la búsqueda).
   */
  createInline: workspaceProcedure.mutation(async ({ ctx }) => {
    const page = await ctx.db.page.create({
      data: {
        workspaceId: ctx.workspace.id,
        title: "Base de datos",
        icon: "🗃️",
        type: "database",
        embedded: true,
        order: rankAtEnd(null),
        content: [],
      },
    });
    const collection = await seedCollection(ctx.db, page.id, "Base de datos");
    return { pageId: page.id, collectionId: collection.id };
  }),

  /** Exporta la colección a CSV: cabecera = nombres de campos, una fila por registro. */
  exportCsv: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        include: {
          page: { select: { title: true } },
          fields: { orderBy: { order: "asc" } },
          records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
        },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const people = await peopleOf(ctx.db, ctx.workspace.id, col.fields);
      const rows = [
        col.fields.map((f) => f.name),
        ...col.records.map((r) => {
          const cells = (r.cells ?? {}) as Record<string, unknown>;
          return col.fields.map((f) => cellToText(f, cells[f.id], r, people));
        }),
      ];
      return { name: col.page.title || col.name || "Base de datos", csv: toCsv(rows) };
    }),

  /** Crea una base de datos nueva a partir de un CSV ya parseado (cabeceras + filas de texto). */
  importCsv: workspaceProcedure
    .input(
      z.object({
        parentId: z.string().nullish(),
        name: z.string().min(1),
        headers: z.array(z.string()).min(1),
        rows: z.array(z.array(z.string())),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.$transaction(
        async (tx) => {
          const page = await tx.page.create({
            data: {
              workspaceId: ctx.workspace.id,
              parentId: input.parentId ?? null,
              title: input.name,
              icon: "🗃️",
              type: "database",
              order: rankAtEnd(last?.order ?? null),
              content: [],
            },
          });
          const collection = await tx.collection.create({ data: { pageId: page.id, name: input.name } });
          let fOrd: string | null = null;
          const fieldIds: string[] = [];
          for (const [i, h] of input.headers.entries()) {
            fOrd = rankAtEnd(fOrd);
            const f = await tx.field.create({
              data: { collectionId: collection.id, name: h.trim() || `Columna ${i + 1}`, type: "text", order: fOrd, config: {} },
            });
            fieldIds.push(f.id);
          }
          await tx.view.create({ data: { collectionId: collection.id, name: "Tabla", type: "table", config: {} } });
          let rOrd: string | null = null;
          const records = input.rows.map((row, i) => {
            rOrd = rankAtEnd(rOrd);
            const cells: Record<string, string> = {};
            fieldIds.forEach((fid, j) => {
              if (row[j]) cells[fid] = row[j];
            });
            return { collectionId: collection.id, order: rOrd, seq: i + 1, cells, createdById: ctx.user.id, updatedById: ctx.user.id };
          });
          if (records.length) await tx.record.createMany({ data: records });
          return page;
        },
        { timeout: 60_000 },
      );
    }),

  /**
   * "Mis tareas": filas de cualquier base de datos del espacio en las que un campo
   * de tipo Persona me incluye. Devuelve también el estado y la fecha si la BD los tiene.
   */
  myTasks: workspaceProcedure.query(async ({ ctx }) => {
    const personFields = await ctx.db.field.findMany({
      where: { type: "person", collection: { page: { workspaceId: ctx.workspace.id, archivedAt: null } } },
      select: { id: true, collectionId: true },
    });
    if (!personFields.length) return [];

    const records = await ctx.db.record.findMany({
      where: {
        archivedAt: null,
        OR: personFields.map((f) => ({
          collectionId: f.collectionId,
          cells: { path: [f.id], array_contains: ctx.user.id },
        })),
      },
      include: {
        collection: {
          include: {
            page: { select: { id: true, title: true, icon: true } },
            fields: { orderBy: { order: "asc" } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    return records.map((r) => {
      const fields = r.collection.fields;
      const cells = (r.cells ?? {}) as Record<string, unknown>;
      const first = (type: string) => fields.find((f) => f.type === type);
      const titleField = first("text");
      const statusField = first("status") ?? first("select");
      const dateField = first("date");
      const label = (f: (typeof fields)[number] | undefined) =>
        f ? cellToText(f, cells[f.id], r) : "";
      return {
        recordId: r.id,
        pageId: r.collection.page.id,
        dbTitle: r.collection.page.title || r.collection.name,
        dbIcon: r.collection.page.icon,
        title: titleField ? String(cells[titleField.id] ?? "") : "",
        status: label(statusField),
        date: dateField ? String(cells[dateField.id] ?? "") : "",
        updatedAt: r.updatedAt,
      };
    });
  }),

  /** Devuelve todo lo necesario para renderizar la base de datos de una página. */
  get: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const collection = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: {
          fields: { orderBy: { order: "asc" } },
          views: { orderBy: { id: "asc" } },
          records: { where: { archivedAt: null }, orderBy: { order: "asc" } },
        },
      });
      if (!collection) throw new TRPCError({ code: "NOT_FOUND" });
      return collection;
    }),

  addField: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Campo"), type: z.enum(FIELD_TYPES) }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: input.type,
          order: rankAtEnd(last?.order ?? null),
          config:
            input.type === "status"
              ? {
                  options: [
                    { id: "st_todo", label: "Sin empezar", color: "gray", group: "todo" },
                    { id: "st_doing", label: "En curso", color: "blue", group: "doing" },
                    { id: "st_done", label: "Hecho", color: "green", group: "done" },
                  ],
                }
              : input.type === "select" || input.type === "multiselect"
                ? { options: [] }
                : {},
        },
      });
    }),

  updateField: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), config: z.any().optional() }))
    .mutation(async ({ ctx, input }) => {
      const f = await ctx.db.field.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!f) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.field.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.config !== undefined ? { config: input.config } : {}),
        },
      });
    }),

  /**
   * Cambia el tipo de un campo ya creado, convirtiendo lo que se pueda de cada celda.
   * No se permite entrar ni salir de relation/rollup/formula: su valor no vive en la celda.
   */
  setFieldType: workspaceProcedure
    .input(z.object({ id: z.string(), type: z.enum(FIELD_TYPES) }))
    .mutation(async ({ ctx, input }) => {
      const field = await ctx.db.field.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });
      if (["relation", "rollup", "formula"].includes(field.type)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ese tipo de campo no se puede convertir." });
      }
      if (field.type === input.type) return { ok: true };

      const records = await ctx.db.record.findMany({
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
      const COLORS = ["gray", "orange", "green", "blue", "red", "yellow"];
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
            // person, files, id, created_time/by, last_edited_time/by: se rellenan solos o no son convertibles.
            return null;
        }
      };

      await ctx.db.$transaction(async (tx) => {
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
      return { ok: true, converted: records.length };
    }),

  deleteField: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const f = await ctx.db.field.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!f) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.field.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addRecord: workspaceProcedure
    .input(z.object({ collectionId: z.string(), cells: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.record.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const maxSeq = await ctx.db.record.aggregate({
        where: { collectionId: input.collectionId },
        _max: { seq: true },
      });
      return ctx.db.record.create({
        data: {
          collectionId: input.collectionId,
          order: rankAtEnd(last?.order ?? null),
          seq: (maxSeq._max.seq ?? 0) + 1,
          cells: input.cells ?? {},
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
    }),

  /** Crea un sub-elemento: registro hijo del indicado, en la misma colección. */
  addSubRecord: workspaceProcedure
    .input(z.object({ parentRecordId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const parent = await ctx.db.record.findFirst({
        where: { id: input.parentRecordId, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true },
      });
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      const last = await ctx.db.record.findFirst({
        where: { collectionId: parent.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const maxSeq = await ctx.db.record.aggregate({
        where: { collectionId: parent.collectionId },
        _max: { seq: true },
      });
      return ctx.db.record.create({
        data: {
          collectionId: parent.collectionId,
          parentId: parent.id,
          order: rankAtEnd(last?.order ?? null),
          seq: (maxSeq._max.seq ?? 0) + 1,
          cells: {},
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
    }),

  updateCell: workspaceProcedure
    .input(z.object({ recordId: z.string(), fieldId: z.string(), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const cells = { ...(rec.cells as Record<string, unknown>), [input.fieldId]: input.value };
      if (input.value === null || input.value === "") delete cells[input.fieldId];
      return ctx.db.record.update({
        where: { id: input.recordId },
        data: { cells: cells as Prisma.InputJsonValue, updatedById: ctx.user.id },
        select: { id: true, cells: true },
      });
    }),

  /** Reordena una fila entre sus hermanas (arrastrar y soltar en la Tabla). */
  moveRecord: workspaceProcedure
    .input(z.object({ id: z.string(), beforeId: z.string().optional(), afterId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true, parentId: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });

      // Solo se reordena entre hermanas: soltar sobre una fila de otro nivel no cambia el padre.
      const siblings = await ctx.db.record.findMany({
        where: { collectionId: rec.collectionId, parentId: rec.parentId, id: { not: rec.id }, archivedAt: null },
        select: { id: true, order: true },
        orderBy: { order: "asc" },
      });
      const anchorId = input.beforeId ?? input.afterId;
      const at = anchorId ? siblings.findIndex((s) => s.id === anchorId) : -1;
      let a: string | null = siblings.at(-1)?.order ?? null; // por defecto, al final
      let b: string | null = null;
      if (at !== -1) {
        if (input.beforeId) {
          a = siblings[at - 1]?.order ?? null;
          b = siblings[at].order;
        } else {
          a = siblings[at].order;
          b = siblings[at + 1]?.order ?? null;
        }
      }
      await ctx.db.record.update({ where: { id: rec.id }, data: { order: rankBetween(a, b) } });
      return { ok: true };
    }),

  /**
   * Guarda las celdas de una fila como plantilla de la base de datos.
   * Para crear una fila desde una plantilla basta con `addRecord({ cells })`.
   */
  saveTemplate: workspaceProcedure
    .input(z.object({ recordId: z.string(), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
        include: { collection: { select: { id: true, templates: true } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const templates = Array.isArray(rec.collection.templates) ? rec.collection.templates : [];
      const template = {
        id: "tpl_" + Math.random().toString(36).slice(2, 9),
        name: input.name,
        cells: (rec.cells ?? {}) as Record<string, unknown>,
      };
      await ctx.db.collection.update({
        where: { id: rec.collection.id },
        data: { templates: [...templates, template] as Prisma.InputJsonValue },
      });
      return template;
    }),

  deleteTemplate: workspaceProcedure
    .input(z.object({ collectionId: z.string(), templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { templates: true },
      });
      const templates = (Array.isArray(col?.templates) ? col.templates : []) as { id: string }[];
      await ctx.db.collection.update({
        where: { id: input.collectionId },
        data: { templates: templates.filter((t) => t.id !== input.templateId) as Prisma.InputJsonValue },
      });
      return { ok: true };
    }),

  /** Duplica una fila justo debajo, con sus subtareas. */
  duplicateRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const src = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!src) throw new TRPCError({ code: "NOT_FOUND" });

      // Se coloca entre el original y el siguiente hermano, para que caiga justo debajo.
      const next = await ctx.db.record.findFirst({
        where: { collectionId: src.collectionId, parentId: src.parentId, order: { gt: src.order } },
        orderBy: { order: "asc" },
        select: { order: true },
      });
      const maxSeq = await ctx.db.record.aggregate({
        where: { collectionId: src.collectionId },
        _max: { seq: true },
      });
      let seq = (maxSeq._max.seq ?? 0) + 1;

      const copyTree = async (rec: typeof src, parentId: string | null, order: string): Promise<string> => {
        const copy = await ctx.db.record.create({
          data: {
            collectionId: rec.collectionId,
            parentId,
            order,
            seq: seq++,
            cells: (rec.cells ?? {}) as Prisma.InputJsonValue,
            content: (rec.content ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
          },
          select: { id: true },
        });
        const children = await ctx.db.record.findMany({
          where: { parentId: rec.id, archivedAt: null },
          orderBy: { order: "asc" },
        });
        let childOrder: string | null = null;
        for (const child of children) {
          childOrder = rankAtEnd(childOrder);
          await copyTree(child, copy.id, childOrder);
        }
        return copy.id;
      };

      const id = await copyTree(src, src.parentId, rankBetween(src.order, next?.order ?? null));
      return { id };
    }),

  /**
   * Borrar una fila la archiva en vez de destruirla: desaparece de vistas, cálculos,
   * exportaciones y API, pero se puede deshacer con restoreRecord.
   */
  deleteRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      // Las subtareas se van con su padre, como al borrar una página con hijas.
      await ctx.db.record.updateMany({ where: { parentId: input.id }, data: { archivedAt: now } });
      await ctx.db.record.update({ where: { id: input.id }, data: { archivedAt: now } });
      return { ok: true };
    }),

  /** Deshacer el borrado de una fila (y de las subtareas que se archivaron con ella). */
  restoreRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, archivedAt: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      if (rec.archivedAt) {
        await ctx.db.record.updateMany({
          where: { parentId: input.id, archivedAt: rec.archivedAt },
          data: { archivedAt: null },
        });
      }
      await ctx.db.record.update({ where: { id: input.id }, data: { archivedAt: null } });
      return { ok: true };
    }),

  /** Cuerpo de bloques de una fila (cada fila es una página, como en Notion). */
  updateRecordContent: workspaceProcedure
    .input(z.object({ id: z.string(), content: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.record.update({
        where: { id: input.id },
        data: { content: input.content as Prisma.InputJsonValue, updatedById: ctx.user.id },
        select: { id: true },
      });
    }),

  updateView: workspaceProcedure
    .input(z.object({ id: z.string(), config: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.view.update({ where: { id: input.id }, data: { config: input.config } });
    }),

  /** Crear una vista nueva en la colección. */
  addView: workspaceProcedure
    .input(z.object({ collectionId: z.string(), type: z.enum(["table", "kanban", "calendar", "timeline", "gallery", "chart", "list", "form"]), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const fields = await ctx.db.field.findMany({
        where: { collectionId: input.collectionId },
        orderBy: { order: "asc" },
      });
      const firstOf = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
      const names: Record<string, string> = { table: "Tabla", kanban: "Kanban", calendar: "Calendario", gallery: "Galería", chart: "Gráfica", list: "Lista", form: "Formulario", timeline: "Cronograma" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = {};
      if (input.type === "kanban") config = { groupByFieldId: firstOf("select") };
      else if (input.type === "calendar" || input.type === "timeline") config = { dateFieldId: firstOf("date") };
      else if (input.type === "chart") config = { chartType: "bar", xFieldId: firstOf("select"), yFieldId: null, agg: "count" };
      return ctx.db.view.create({
        data: { collectionId: input.collectionId, name: input.name?.trim() || names[input.type], type: input.type, config },
      });
    }),

  /** Renombrar una vista. */
  renameView: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.view.update({ where: { id: input.id }, data: { name: input.name.trim() } });
    }),

  /** Borrar una vista (no la última). */
  deleteView: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const count = await ctx.db.view.count({ where: { collectionId: v.collectionId } });
      if (count <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes borrar la última vista." });
      await ctx.db.view.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Cambiar el tipo de una vista ("Mostrar como"), recalculando su config por defecto. */
  setViewType: workspaceProcedure
    .input(z.object({ id: z.string(), type: z.enum(["table", "kanban", "calendar", "timeline", "gallery", "chart", "list", "form"]) }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true, config: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const fields = await ctx.db.field.findMany({
        where: { collectionId: v.collectionId },
        orderBy: { order: "asc" },
      });
      const firstOf = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (v.config as any) ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = { filters: prev.filters, sorts: prev.sorts };
      if (input.type === "kanban") config.groupByFieldId = prev.groupByFieldId ?? firstOf("select");
      else if (input.type === "calendar" || input.type === "timeline") config.dateFieldId = prev.dateFieldId ?? firstOf("date");
      else if (input.type === "chart")
        config = { ...config, chartType: prev.chartType ?? "bar", xFieldId: prev.xFieldId ?? firstOf("select"), yFieldId: prev.yFieldId ?? null, agg: prev.agg ?? "count" };
      return ctx.db.view.update({ where: { id: input.id }, data: { type: input.type, config } });
    }),

  /** Lista todas las bases de datos del workspace (para elegir destino de una relación). */
  listDatabases: workspaceProcedure.query(async ({ ctx }) => {
    const cols = await ctx.db.collection.findMany({
      where: { page: { workspaceId: ctx.workspace.id, type: "database", archivedAt: null, embedded: false } },
      select: {
        id: true,
        page: { select: { id: true, title: true, icon: true } },
        fields: { orderBy: { order: "asc" }, select: { id: true, name: true, type: true } },
      },
    });
    return cols.map((c) => ({
      collectionId: c.id,
      pageId: c.page.id,
      title: c.page.title,
      icon: c.page.icon,
      fields: c.fields,
    }));
  }),

  /** Registros de una colección como opciones {id,title} para el selector de relación. */
  relationOptions: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        include: { fields: { orderBy: { order: "asc" } }, records: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const titleField = col.fields.find((f) => f.type === "text") ?? col.fields[0];
      return col.records.map((r) => {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        const t = titleField ? cells[titleField.id] : "";
        return { id: r.id, title: (typeof t === "string" && t) || "Sin título" };
      });
    }),

  /** Crea un campo de relación que apunta a otra base de datos. */
  addRelation: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Relación"), targetCollectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const target = await assertCollection(ctx, input.targetCollectionId);
      const tPage = await ctx.db.collection.findUnique({
        where: { id: input.targetCollectionId },
        select: { pageId: true },
      });
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "relation",
          order: rankAtEnd(last?.order ?? null),
          config: { targetCollectionId: target.id, targetPageId: tPage?.pageId ?? null },
        },
      });
    }),

  /** Crea un campo rollup que agrega valores de los registros relacionados. */
  addRollup: workspaceProcedure
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().default("Rollup"),
        relationFieldId: z.string(),
        targetFieldId: z.string().nullish(),
        agg: z.enum(["count", "sum", "avg", "min", "max", "values"]).default("count"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "rollup",
          order: rankAtEnd(last?.order ?? null),
          config: {
            relationFieldId: input.relationFieldId,
            targetFieldId: input.targetFieldId ?? null,
            agg: input.agg,
          },
        },
      });
    }),

  /** Crea un campo de fórmula (expresión calculada estilo Notion). */
  addFormula: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Fórmula"), expression: z.string().default("") }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "formula",
          order: rankAtEnd(last?.order ?? null),
          config: { expression: input.expression },
        },
      });
    }),

  /** Resuelve etiquetas de relaciones, valores de rollups y fórmulas (se calcula en el servidor). */
  computed: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: { where: { archivedAt: null }, orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });

      const relationFields = col.fields.filter((f) => f.type === "relation");
      const rollupFields = col.fields.filter((f) => f.type === "rollup");
      const formulaFields = col.fields.filter((f) => f.type === "formula");

      // Valor escalar de un campo para el contexto de fórmulas.
      const scalarOf = (field: (typeof col.fields)[number], cellVal: unknown): number | string | boolean | null => {
        if (cellVal === undefined || cellVal === null || cellVal === "") return null;
        if (field.type === "select") {
          const opts = ((field.config as { options?: { id: string; label: string }[] }).options) ?? [];
          return opts.find((o) => o.id === cellVal)?.label ?? String(cellVal);
        }
        if (field.type === "checkbox") return Boolean(cellVal);
        if (field.type === "number") return Number(cellVal);
        if (field.type === "relation") return Array.isArray(cellVal) ? cellVal.length : 0;
        return typeof cellVal === "string" ? cellVal : String(cellVal);
      };

      // Cargar las colecciones destino referenciadas por las relaciones.
      const targetColIds = [
        ...new Set(
          relationFields
            .map((f) => (f.config as { targetCollectionId?: string })?.targetCollectionId)
            .filter((x): x is string => !!x),
        ),
      ];
      const targetCols = await ctx.db.collection.findMany({
        where: { id: { in: targetColIds }, page: { workspaceId: ctx.workspace.id } },
        include: { fields: { orderBy: { order: "asc" } }, records: true },
      });
      // Índice: colección destino -> (recordId -> {title, cells}), y su titleFieldId.
      const targetIndex = new Map<
        string,
        { titleFieldId: string | null; recs: Map<string, Record<string, unknown>>; titles: Map<string, string> }
      >();
      for (const tc of targetCols) {
        const titleField = tc.fields.find((f) => f.type === "text") ?? tc.fields[0];
        const recs = new Map<string, Record<string, unknown>>();
        const titles = new Map<string, string>();
        for (const r of tc.records) {
          const cells = (r.cells ?? {}) as Record<string, unknown>;
          recs.set(r.id, cells);
          const t = titleField ? cells[titleField.id] : "";
          titles.set(r.id, (typeof t === "string" && t) || "Sin título");
        }
        targetIndex.set(tc.id, { titleFieldId: titleField?.id ?? null, recs, titles });
      }

      const relIdsOf = (cells: Record<string, unknown>, fieldId: string): string[] => {
        const v = cells[fieldId];
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      };

      const relationLabels: Record<string, Record<string, { id: string; title: string }[]>> = {};
      const rollups: Record<string, Record<string, string | number>> = {};

      for (const rec of col.records) {
        const cells = (rec.cells ?? {}) as Record<string, unknown>;
        // etiquetas de relación
        for (const rf of relationFields) {
          const tcid = (rf.config as { targetCollectionId?: string })?.targetCollectionId;
          const idx = tcid ? targetIndex.get(tcid) : undefined;
          const ids = relIdsOf(cells, rf.id);
          const labels = ids.map((id) => ({ id, title: idx?.titles.get(id) ?? "—" }));
          (relationLabels[rec.id] ??= {})[rf.id] = labels;
        }
        // rollups
        for (const rup of rollupFields) {
          const cfg = (rup.config ?? {}) as { relationFieldId?: string; targetFieldId?: string | null; agg?: string };
          const relField = relationFields.find((f) => f.id === cfg.relationFieldId);
          const tcid = relField ? (relField.config as { targetCollectionId?: string })?.targetCollectionId : undefined;
          const idx = tcid ? targetIndex.get(tcid) : undefined;
          const ids = relField ? relIdsOf(cells, relField.id) : [];
          const agg = cfg.agg ?? "count";
          let out: string | number = 0;
          if (agg === "count") {
            out = ids.length;
          } else if (cfg.targetFieldId && idx) {
            const tf = targetCols.find((t) => t.id === tcid)?.fields.find((f) => f.id === cfg.targetFieldId);
            const raw = ids.map((id) => idx.recs.get(id)?.[cfg.targetFieldId!]).filter((v) => v !== undefined && v !== null && v !== "");
            if (agg === "values") {
              const toLabel = (v: unknown) => {
                if (tf?.type === "select") {
                  const opts = ((tf.config as { options?: { id: string; label: string }[] }).options) ?? [];
                  return opts.find((o) => o.id === v)?.label ?? String(v);
                }
                return String(v);
              };
              out = raw.map(toLabel).join(", ");
            } else {
              const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
              if (nums.length === 0) out = 0;
              else if (agg === "sum") out = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
              else if (agg === "avg") out = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
              else if (agg === "min") out = Math.min(...nums);
              else if (agg === "max") out = Math.max(...nums);
            }
          }
          (rollups[rec.id] ??= {})[rup.id] = out;
        }
        // fórmulas (pueden referenciar otros campos y rollups por nombre)
        if (formulaFields.length) {
          const cellsRec = (rec.cells ?? {}) as Record<string, unknown>;
          const ctxByName: Record<string, number | string | boolean | null> = {};
          for (const f of col.fields) {
            if (f.type === "rollup") ctxByName[f.name] = rollups[rec.id]?.[f.id] ?? null;
            else if (f.type !== "formula") ctxByName[f.name] = scalarOf(f, cellsRec[f.id]);
          }
          for (const ff of formulaFields) {
            const expr = (ff.config as { expression?: string })?.expression ?? "";
            const v = evalFormula(expr, ctxByName);
            (rollups[rec.id] ??= {})[ff.id] = v === null ? "" : (v as string | number);
          }
        }
      }

      return { relationLabels, rollups };
    }),

  /** Datos agregados para una vista de gráfica (se calcula en el servidor). */
  chartData: workspaceProcedure
    .input(z.object({ pageId: z.string(), viewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: true, views: true },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const view = col.views.find((v) => v.id === input.viewId);
      const cfg = (view?.config ?? {}) as {
        chartType?: string;
        xFieldId?: string;
        yFieldId?: string | null;
        agg?: string;
      };
      const xField = col.fields.find((f) => f.id === cfg.xFieldId);
      const yField = cfg.yFieldId ? col.fields.find((f) => f.id === cfg.yFieldId) : null;
      const agg = cfg.agg ?? "count";

      // Etiqueta del valor del eje X según el tipo de campo.
      const xLabel = (val: unknown): string => {
        if (val === null || val === undefined || val === "") return "Sin valor";
        if (xField?.type === "select") {
          const opts = ((xField.config as { options?: { id: string; label: string }[] }).options) ?? [];
          return opts.find((o) => o.id === val)?.label ?? String(val);
        }
        if (xField?.type === "date") return (dayOf(val) ?? String(val)).slice(0, 7); // agrupa por mes YYYY-MM
        if (xField?.type === "checkbox") return val ? "Sí" : "No";
        return String(val);
      };

      const groups = new Map<string, number[]>();
      for (const r of col.records) {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        const label = xLabel(xField ? cells[xField.id] : undefined);
        let y = 1;
        if (yField) {
          const n = Number(cells[yField.id]);
          y = Number.isFinite(n) ? n : 0;
        }
        const arr = groups.get(label) ?? [];
        arr.push(y);
        groups.set(label, arr);
      }

      const categories = [...groups.keys()].sort();
      const values = categories.map((c) => {
        const arr = groups.get(c)!;
        if (agg === "count") return arr.length;
        const sum = arr.reduce((a, b) => a + b, 0);
        if (agg === "avg") return arr.length ? Math.round((sum / arr.length) * 100) / 100 : 0;
        return Math.round(sum * 100) / 100; // sum
      });

      return {
        chartType: cfg.chartType ?? "bar",
        categories,
        values,
        xName: xField?.name ?? "",
        yName: agg === "count" ? "Registros" : yField?.name ?? "",
      };
    }),
});
