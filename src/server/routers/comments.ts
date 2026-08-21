import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { sendPush } from "../push";
import { exigeNivel, type Nivel } from "../services/perms";

async function assertPage(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string }; user: { id: string }; role?: string },
  pageId: string,
  min: Nivel = "view",
) {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  await exigeNivel(ctx.db, pageId, ctx.user.id, ctx.role ?? "member", min);
}

export const commentsRouter = router({
  /** Comentarios de una página, del más antiguo al más nuevo, con su autor. */
  list: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      return ctx.db.comment.findMany({
        where: { pageId: input.pageId },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
    }),

  add: workspaceProcedure
    .input(z.object({ pageId: z.string(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId, "comment");
      const comment = await ctx.db.comment.create({
        data: { pageId: input.pageId, authorId: ctx.user.id, body: input.body },
      });
      // Avisa a los demás participantes: quienes ya comentaron esta página.
      // Anti-duplicados como en las menciones: una sin leer del mismo actor basta.
      const previos = await ctx.db.comment.findMany({
        where: { pageId: input.pageId, authorId: { not: ctx.user.id } },
        select: { authorId: true },
        distinct: ["authorId"],
      });
      if (previos.length) {
        const page = await ctx.db.page.findUnique({ where: { id: input.pageId }, select: { title: true } });
        const resumen = input.body.length > 80 ? input.body.slice(0, 77) + "…" : input.body;
        for (const { authorId } of previos) {
          const dup = await ctx.db.notification.findFirst({
            where: { userId: authorId, pageId: input.pageId, actorId: ctx.user.id, type: "comment", read: false },
            select: { id: true },
          });
          if (dup) continue;
          await ctx.db.notification.create({
            data: {
              userId: authorId,
              workspaceId: ctx.workspace.id,
              type: "comment",
              title: resumen,
              pageId: input.pageId,
              actorId: ctx.user.id,
            },
          });
          sendPush(authorId, {
            title: `${ctx.user.name || ctx.user.email} ha comentado en ${page?.title || "Sin título"}`,
            body: resumen,
            url: `/p/${input.pageId}`,
          });
        }
      }
      return comment;
    }),

  /** Editar un comentario: solo su autor. */
  edit: workspaceProcedure
    .input(z.object({ id: z.string(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, authorId: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      if (c.authorId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Solo el autor puede editarlo." });
      return ctx.db.comment.update({ where: { id: c.id }, data: { body: input.body } });
    }),

  toggleResolve: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, resolved: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.comment.update({
        where: { id: c.id },
        data: { resolved: !c.resolved },
        select: { id: true, resolved: true },
      });
    }),

  /** Borrar un comentario: solo su autor, el propietario del espacio o un admin. */
  remove: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.comment.findFirst({
        where: { id: input.id, page: { workspaceId: ctx.workspace.id } },
        select: { id: true, authorId: true },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const isAdmin = ctx.user.role === "admin" || ctx.role === "owner";
      if (c.authorId !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo el autor puede borrar su comentario." });
      }
      await ctx.db.comment.delete({ where: { id: c.id } });
      return { ok: true };
    }),
});
