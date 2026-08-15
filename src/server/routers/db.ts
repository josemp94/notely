import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd } from "@/lib/fractional";

// Tipos de campo soportados en Fase 2
export const FIELD_TYPES = ["text", "number", "select", "checkbox", "date"] as const;

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
      const collection = await ctx.db.collection.create({
        data: { pageId: page.id, name: input.title },
      });
      // Campos por defecto
      const nombre = await ctx.db.field.create({
        data: { collectionId: collection.id, name: "Nombre", type: "text", order: rankAtEnd(null), config: {} },
      });
      const estadoOpts = [
        { id: "opt_todo", label: "Por hacer", color: "gray" },
        { id: "opt_doing", label: "En curso", color: "orange" },
        { id: "opt_done", label: "Hecho", color: "green" },
      ];
      const estado = await ctx.db.field.create({
        data: {
          collectionId: collection.id,
          name: "Estado",
          type: "select",
          order: rankAtEnd(nombre.order),
          config: { options: estadoOpts },
        },
      });
      // Vistas
      await ctx.db.view.create({
        data: { collectionId: collection.id, name: "Tabla", type: "table", config: {} },
      });
      await ctx.db.view.create({
        data: {
          collectionId: collection.id,
          name: "Kanban",
          type: "kanban",
          config: { groupByFieldId: estado.id },
        },
      });
      // Filas de ejemplo
      let ord: string | null = null;
      for (const [i, name] of ["Primera tarea", "Segunda tarea"].entries()) {
        ord = rankAtEnd(ord);
        await ctx.db.record.create({
          data: {
            collectionId: collection.id,
            order: ord,
            cells: { [nombre.id]: name, [estado.id]: i === 0 ? "opt_todo" : "opt_doing" },
          },
        });
      }
      return page;
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
          views: { orderBy: { name: "asc" } },
          records: { orderBy: { order: "asc" } },
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
          config: input.type === "select" ? { options: [] } : {},
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
      return ctx.db.record.create({
        data: {
          collectionId: input.collectionId,
          order: rankAtEnd(last?.order ?? null),
          cells: input.cells ?? {},
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
        data: { cells: cells as Prisma.InputJsonValue },
        select: { id: true, cells: true },
      });
    }),

  deleteRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.record.delete({ where: { id: input.id } });
      return { ok: true };
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
});
