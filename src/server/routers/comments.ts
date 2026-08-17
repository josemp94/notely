import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";

async function assertPage(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  pageId: string,
) {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
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
      await assertPage(ctx, input.pageId);
      return ctx.db.comment.create({
        data: { pageId: input.pageId, authorId: ctx.user.id, body: input.body },
      });
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
