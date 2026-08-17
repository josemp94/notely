import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd, rankBetween } from "@/lib/fractional";

/** Nodo del árbol de páginas para el sidebar. */
type TreeNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: string;
  hasChildren: boolean;
};

export const pagesRouter = router({
  /** Árbol completo de páginas vivas del workspace (para el sidebar). */
  tree: workspaceProcedure.query(async ({ ctx }): Promise<TreeNode[]> => {
    const pages = await ctx.db.page.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: null },
      select: { id: true, title: true, icon: true, parentId: true, order: true },
      orderBy: { order: "asc" },
    });
    const childCount = new Map<string, number>();
    for (const p of pages) {
      if (p.parentId) childCount.set(p.parentId, (childCount.get(p.parentId) ?? 0) + 1);
    }
    return pages.map((p) => ({ ...p, hasChildren: childCount.has(p.id) }));
  }),

  /** Búsqueda por título para la paleta de comandos (Ctrl+K). */
  search: workspaceProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) return [];
      return ctx.db.page.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          archivedAt: null,
          title: { contains: q, mode: "insensitive" },
        },
        select: { id: true, title: true, icon: true, type: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      });
    }),

  /** Contenido de una página. */
  get: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      return page;
    }),

  /** Crear página (opcionalmente hija de otra). */
  create: workspaceProcedure
    .input(z.object({ parentId: z.string().nullish(), title: z.string().default("") }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.page.create({
        data: {
          workspaceId: ctx.workspace.id,
          parentId: input.parentId ?? null,
          title: input.title,
          order: rankAtEnd(last?.order ?? null),
          content: [],
        },
      });
    }),

  /** Renombrar (título + icono). */
  rename: workspaceProcedure
    .input(z.object({ id: z.string(), title: z.string(), icon: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { title: input.title, ...(input.icon !== undefined ? { icon: input.icon } : {}) },
      });
    }),

  /** Poner o quitar la portada. */
  setCover: workspaceProcedure
    .input(z.object({ id: z.string(), cover: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { cover: input.cover },
        select: { id: true, cover: true },
      });
    }),

  /** Guardar contenido de bloques (autosave). */
  updateContent: workspaceProcedure
    .input(z.object({ id: z.string(), content: z.any() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { content: input.content },
        select: { id: true, updatedAt: true },
      });
    }),

  /** Mover una página: re-parent y/o reordenar entre hermanas (drag & drop del sidebar). */
  move: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        beforeId: z.string().optional(), // insertar justo antes de esta hermana
        afterId: z.string().optional(), // insertar justo después de esta hermana
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      if (input.parentId) {
        await assertOwned(ctx, input.parentId);
        const subtree = await descendantIds(ctx, input.id);
        if (subtree.includes(input.parentId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No puedes mover una página dentro de su propio subárbol.",
          });
        }
      }
      const siblings = await ctx.db.page.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          parentId: input.parentId,
          archivedAt: null,
          id: { not: input.id },
        },
        select: { id: true, order: true },
        orderBy: { order: "asc" },
      });
      const anchorId = input.beforeId ?? input.afterId;
      const anchor = anchorId ? siblings.findIndex((s) => s.id === anchorId) : -1;
      let a: string | null = siblings.at(-1)?.order ?? null; // por defecto: al final
      let b: string | null = null;
      if (anchor !== -1) {
        if (input.beforeId) {
          a = siblings[anchor - 1]?.order ?? null;
          b = siblings[anchor].order;
        } else {
          a = siblings[anchor].order;
          b = siblings[anchor + 1]?.order ?? null;
        }
      }
      return ctx.db.page.update({
        where: { id: input.id },
        data: { parentId: input.parentId, order: rankBetween(a, b) },
        select: { id: true, parentId: true, order: true },
      });
    }),

  /** Enviar a la papelera (soft-delete, con subárbol). */
  archive: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      await ctx.db.page.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: new Date() },
      });
      return { archived: ids.length };
    }),

  /** Listar la papelera (páginas archivadas). */
  trash: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.db.page.findMany({
      where: { workspaceId: ctx.workspace.id, archivedAt: { not: null } },
      select: { id: true, title: true, icon: true, parentId: true, archivedAt: true },
      orderBy: { archivedAt: "desc" },
    });
  }),

  /** Restaurar de la papelera (con subárbol). */
  restore: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      await ctx.db.page.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: null },
      });
      return { restored: ids.length };
    }),

  /** Borrar definitivamente (con subárbol). */
  remove: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      const ids = await descendantIds(ctx, input.id);
      // Borra hijos antes que padres para respetar la relación de árbol.
      await ctx.db.page.deleteMany({ where: { id: { in: ids } } });
      return { removed: ids.length };
    }),
});

async function assertOwned(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  id: string,
) {
  const p = await ctx.db.page.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
}

/** Devuelve el id de la página y de todos sus descendientes. */
async function descendantIds(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  rootId: string,
): Promise<string[]> {
  const all = await ctx.db.page.findMany({
    where: { workspaceId: ctx.workspace.id },
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const p of all) {
    if (p.parentId) {
      const arr = byParent.get(p.parentId) ?? [];
      arr.push(p.id);
      byParent.set(p.parentId, arr);
    }
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    for (const c of byParent.get(id) ?? []) stack.push(c);
  }
  return result;
}
