import { z } from "zod";
import { router, workspaceProcedure, authedProcedure } from "../trpc";

export const notificationsRouter = router({
  /** Bandeja del usuario en el espacio activo (más recientes primero). */
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db.notification.findMany({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { name: true, email: true } },
        page: { select: { id: true, title: true, icon: true } },
      },
    }),
  ),

  unreadCount: workspaceProcedure.query(({ ctx }) =>
    ctx.db.notification.count({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace.id, read: false },
    }),
  ),

  // markRead/markAllRead usan authedProcedure a propósito: workspaceProcedure bloquea
  // todas las mutaciones a los viewers, pero marcar tus propias notificaciones no edita nada.
  markRead: authedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.notification.updateMany({
      where: { id: input.id, userId: ctx.user.id },
      data: { read: true },
    });
    return { ok: true };
  }),

  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, workspaceId: ctx.workspace?.id, read: false },
      data: { read: true },
    });
    return { ok: true };
  }),

  /** El editor llama aquí al insertar una mención @persona. */
  notifyMention: workspaceProcedure
    .input(z.object({ pageId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) return { ok: true }; // no auto-notificarse
      const page = await ctx.db.page.findFirst({
        where: { id: input.pageId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });
      if (!page) return { ok: false };
      const member = await ctx.db.member.findUnique({
        where: { workspaceId_userId: { workspaceId: ctx.workspace.id, userId: input.userId } },
        select: { id: true },
      });
      if (!member) return { ok: false }; // solo se notifica a miembros del espacio
      // Anti-duplicados (autosave): si ya tiene una sin leer del mismo actor en la misma página, no crea otra.
      const dup = await ctx.db.notification.findFirst({
        where: { userId: input.userId, pageId: input.pageId, actorId: ctx.user.id, type: "mention", read: false },
        select: { id: true },
      });
      if (dup) return { ok: true };
      await ctx.db.notification.create({
        data: {
          userId: input.userId,
          workspaceId: ctx.workspace.id,
          type: "mention",
          pageId: input.pageId,
          actorId: ctx.user.id,
        },
      });
      return { ok: true };
    }),
});
