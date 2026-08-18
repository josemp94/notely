import { randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd, rankBetween } from "@/lib/fractional";
import { TEMPLATES } from "@/lib/templates";

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

  /** Crea una página o base de datos prehecha a partir de una plantilla de la galería. */
  createFromTemplate: workspaceProcedure
    .input(z.object({ key: z.string(), parentId: z.string().nullish() }))
    .mutation(async ({ ctx, input }) => {
      const tplDef = TEMPLATES[input.key];
      if (!tplDef) throw new TRPCError({ code: "BAD_REQUEST", message: "Plantilla desconocida." });
      const tpl = tplDef.make();
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const base = {
        workspaceId: ctx.workspace.id,
        parentId: input.parentId ?? null,
        title: tplDef.name,
        icon: tplDef.icon,
        order: rankAtEnd(last?.order ?? null),
      };
      if (tpl.type === "doc") {
        const page = await ctx.db.page.create({
          data: { ...base, content: tpl.content as Prisma.InputJsonValue },
        });
        return { id: page.id };
      }
      const id = await ctx.db.$transaction(async (tx) => {
        const page = await tx.page.create({ data: { ...base, type: "database", content: [] } });
        const col = await tx.collection.create({ data: { pageId: page.id, name: tplDef.name } });
        const idByName = new Map<string, string>();
        let fOrd: string | null = null;
        for (const f of tpl.fields) {
          fOrd = rankAtEnd(fOrd);
          const created = await tx.field.create({
            data: { collectionId: col.id, name: f.name, type: f.type, order: fOrd, config: (f.config ?? {}) as Prisma.InputJsonValue },
          });
          idByName.set(f.name, created.id);
        }
        for (const v of tpl.views) {
          const config: Record<string, unknown> = {};
          if (v.groupByField) config.groupByFieldId = idByName.get(v.groupByField) ?? null;
          if (v.calcs) {
            config.calcs = Object.fromEntries(
              Object.entries(v.calcs).flatMap(([name, calc]) => {
                const fid = idByName.get(name);
                return fid ? [[fid, calc] as const] : [];
              }),
            );
          }
          await tx.view.create({
            data: { collectionId: col.id, name: v.name, type: v.type, config: config as Prisma.InputJsonValue },
          });
        }
        let rOrd: string | null = null;
        for (const [i, rec] of tpl.records.entries()) {
          rOrd = rankAtEnd(rOrd);
          const cells: Record<string, unknown> = {};
          for (const [name, value] of Object.entries(rec)) {
            const fid = idByName.get(name);
            if (fid && value !== "" && value != null) cells[fid] = value;
          }
          await tx.record.create({
            data: { collectionId: col.id, order: rOrd, seq: i + 1, cells: cells as Prisma.InputJsonValue },
          });
        }
        return page.id;
      });
      return { id };
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

  /** Guardar contenido de bloques (autosave). Snapshota el contenido anterior como Version. */
  updateContent: workspaceProcedure
    .input(z.object({ id: z.string(), content: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, content: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      // ponytail: throttle simple — solo se crea versión si la última tiene más de 2 min;
      // dentro de la ventana se omite (la versión reciente ya cubre ese estado).
      const last = await ctx.db.version.findFirst({
        where: { pageId: input.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!last || Date.now() - last.createdAt.getTime() > 2 * 60_000) {
        await ctx.db.version.create({
          data: { pageId: input.id, snapshot: (page.content ?? []) as Prisma.InputJsonValue, authorId: ctx.user.id },
        });
      }
      return ctx.db.page.update({
        where: { id: input.id },
        data: { content: input.content },
        select: { id: true, updatedAt: true },
      });
    }),

  /** Historial de versiones del contenido de una página. */
  versions: router({
    /** Últimas versiones (más recientes primero), con autor resuelto. */
    list: workspaceProcedure
      .input(z.object({ pageId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertOwned(ctx, input.pageId);
        const versions = await ctx.db.version.findMany({
          where: { pageId: input.pageId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        const authorIds = [...new Set(versions.map((v) => v.authorId).filter((x): x is string => !!x))];
        const users = await ctx.db.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true },
        });
        const nameById = new Map(users.map((u) => [u.id, u.name || u.email]));
        return versions.map((v) => ({
          id: v.id,
          createdAt: v.createdAt,
          author: v.authorId ? (nameById.get(v.authorId) ?? null) : null,
          snapshot: v.snapshot,
        }));
      }),

    /** Repone el contenido de una versión, guardando antes el estado actual como versión nueva. */
    restore: workspaceProcedure
      .input(z.object({ versionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const version = await ctx.db.version.findFirst({
          where: { id: input.versionId, page: { workspaceId: ctx.workspace.id } },
          include: { page: { select: { id: true, content: true } } },
        });
        if (!version) throw new TRPCError({ code: "NOT_FOUND" });
        await ctx.db.$transaction([
          ctx.db.version.create({
            data: {
              pageId: version.pageId,
              snapshot: (version.page.content ?? []) as Prisma.InputJsonValue,
              authorId: ctx.user.id,
            },
          }),
          ctx.db.page.update({
            where: { id: version.pageId },
            data: { content: version.snapshot as Prisma.InputJsonValue },
          }),
        ]);
        return { pageId: version.pageId };
      }),
  }),

  /** Publica la página en la web. Idempotente: conserva el token (y la URL) si ya estaba publicada. */
  publish: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const page = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, publicToken: true },
      });
      if (!page) throw new TRPCError({ code: "NOT_FOUND" });
      if (page.publicToken) return { id: page.id, publicToken: page.publicToken };
      return ctx.db.page.update({
        where: { id: page.id },
        data: { publicToken: randomBytes(16).toString("base64url") },
        select: { id: true, publicToken: true },
      });
    }),

  /** Retira la página de la web (invalida la URL pública). */
  unpublish: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.id);
      return ctx.db.page.update({
        where: { id: input.id },
        data: { publicToken: null },
        select: { id: true, publicToken: true },
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

  /** Duplicar una página (copia profunda: contenido, colección y subpáginas). */
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orig = await ctx.db.page.findFirst({
        where: { id: input.id, workspaceId: ctx.workspace.id },
        select: { id: true, parentId: true, order: true },
      });
      if (!orig) throw new TRPCError({ code: "NOT_FOUND" });
      // La copia va justo detrás de la original entre sus hermanas.
      const next = await ctx.db.page.findFirst({
        where: {
          workspaceId: ctx.workspace.id,
          parentId: orig.parentId,
          archivedAt: null,
          order: { gt: orig.order },
        },
        orderBy: { order: "asc" },
        select: { order: true },
      });
      const id = await ctx.db.$transaction(
        (tx) =>
          copyPage(tx, ctx.workspace.id, orig.id, orig.parentId, rankBetween(orig.order, next?.order ?? null), true),
        { timeout: 30_000 },
      );
      return { id };
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

  /** Marcar/desmarcar una página como favorita (★, por usuario). */
  toggleFavorite: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx, input.pageId);
      const key = { userId_pageId: { userId: ctx.user.id, pageId: input.pageId } };
      const existing = await ctx.db.favorite.findUnique({ where: key });
      if (existing) {
        await ctx.db.favorite.delete({ where: key });
        return { favorite: false };
      }
      await ctx.db.favorite.create({ data: { userId: ctx.user.id, pageId: input.pageId } });
      return { favorite: true };
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

/** Favoritos del usuario en el workspace activo (sección ⭐ del sidebar). */
export const favoritesRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    const favs = await ctx.db.favorite.findMany({
      where: { userId: ctx.user.id, page: { workspaceId: ctx.workspace.id, archivedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { page: { select: { id: true, title: true, icon: true } } },
    });
    return favs.map((f) => f.page);
  }),
});

/** Sustituye ids antiguos por nuevos dentro de un JSON (cells, configs, specs). Los cuid son únicos, el reemplazo textual es seguro. */
function remapIds<T>(value: T, map: Map<string, string>): T {
  let s = JSON.stringify(value);
  if (s === undefined) return value;
  for (const [oldId, newId] of map) s = s.split(oldId).join(newId);
  return JSON.parse(s) as T;
}

function asJson(v: Prisma.JsonValue | null) {
  return v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

/** Copia profunda de una página: contenido, colección (campos/vistas/registros), gráficas y subpáginas. */
async function copyPage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  srcId: string,
  parentId: string | null,
  order: string,
  isRoot: boolean,
): Promise<string> {
  const src = await tx.page.findUniqueOrThrow({
    where: { id: srcId },
    include: {
      collection: {
        include: {
          fields: { orderBy: { order: "asc" } },
          views: { orderBy: { id: "asc" } },
          records: { orderBy: { order: "asc" } },
        },
      },
      charts: true,
    },
  });

  const page = await tx.page.create({
    data: {
      workspaceId,
      parentId,
      title: isRoot ? `${src.title} (copia)` : src.title,
      icon: src.icon,
      cover: src.cover,
      type: src.type,
      order,
      content: asJson(src.content),
    },
  });
  const map = new Map<string, string>([[src.id, page.id]]);

  if (src.collection) {
    const col = await tx.collection.create({ data: { pageId: page.id, name: src.collection.name } });
    map.set(src.collection.id, col.id);
    for (const f of src.collection.fields) {
      const nf = await tx.field.create({
        data: { collectionId: col.id, name: f.name, type: f.type, order: f.order, config: f.config as Prisma.InputJsonValue },
      });
      map.set(f.id, nf.id);
    }
    const createdRecords: { newId: string; orig: Prisma.JsonValue; stored: Prisma.JsonValue }[] = [];
    for (const r of src.collection.records) {
      const cells = remapIds(r.cells, map);
      const nr = await tx.record.create({
        data: {
          collectionId: col.id,
          order: r.order,
          seq: r.seq,
          cells: cells as Prisma.InputJsonValue,
          content: r.content === null ? Prisma.DbNull : (remapIds(r.content, map) as Prisma.InputJsonValue),
        },
      });
      map.set(r.id, nr.id);
      createdRecords.push({ newId: nr.id, orig: r.cells, stored: cells });
    }
    // Vistas: se crean al final, con el mapa completo (campos y registros ya remapeables).
    for (const v of src.collection.views) {
      await tx.view.create({
        data: { collectionId: col.id, name: v.name, type: v.type, config: remapIds(v.config, map) as Prisma.InputJsonValue },
      });
    }
    // Segunda pasada: configs de campo (relación/rollup a la propia colección) y celdas con relaciones internas.
    for (const f of src.collection.fields) {
      const cfg = remapIds(f.config, map);
      if (JSON.stringify(cfg) !== JSON.stringify(f.config)) {
        await tx.field.update({ where: { id: map.get(f.id)! }, data: { config: cfg as Prisma.InputJsonValue } });
      }
    }
    for (const r of createdRecords) {
      const cells = remapIds(r.orig, map);
      if (JSON.stringify(cells) !== JSON.stringify(r.stored)) {
        await tx.record.update({ where: { id: r.newId }, data: { cells: cells as Prisma.InputJsonValue } });
      }
    }
  }

  for (const ch of src.charts) {
    await tx.chart.create({ data: { pageId: page.id, name: ch.name, spec: remapIds(ch.spec, map) as Prisma.InputJsonValue } });
  }

  const children = await tx.page.findMany({
    where: { parentId: src.id, archivedAt: null },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  for (const c of children) {
    // Las hermanas nuevas nacen sin conflicto: se reutiliza el order original de cada hija.
    await copyPage(tx, workspaceId, c.id, page.id, c.order, false);
  }
  return page.id;
}

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
