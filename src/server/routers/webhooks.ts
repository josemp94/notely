import crypto from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { WEBHOOK_EVENTS } from "../webhooks";

/** Avisos salientes del espacio. Solo el propietario los gestiona. */
export const webhooksRouter = router({
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db.webhook.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, events: true, active: true, lastStatus: true, lastAt: true, createdAt: true },
    }),
  ),

  create: workspaceProcedure
    .input(
      z.object({
        url: z.string().url().max(500),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Solo el propietario del espacio puede crear avisos." });
      const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
      const hook = await ctx.db.webhook.create({
        data: {
          workspaceId: ctx.workspace.id,
          url: input.url,
          secret,
          events: input.events.join(","),
          createdById: ctx.user.id,
        },
        select: { id: true },
      });
      // El secreto se enseña una vez, como los tokens de la API.
      return { id: hook.id, secret };
    }),

  remove: workspaceProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    if (ctx.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
    await ctx.db.webhook.deleteMany({ where: { id: input.id, workspaceId: ctx.workspace.id } });
    return { ok: true };
  }),
});
