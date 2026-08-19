import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { publicVapidKey } from "../push";

/** Suscripción del navegador a los avisos push (uno por dispositivo). */
export const pushRouter = router({
  publicKey: authedProcedure.query(() => publicVapidKey()),

  subscribe: authedProcedure
    .input(z.object({ endpoint: z.string().url(), p256dh: z.string(), auth: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Un mismo navegador puede reinstalarse: el endpoint manda, y se reasigna al usuario actual.
      await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { userId: ctx.user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
        update: { userId: ctx.user.id, p256dh: input.p256dh, auth: input.auth },
      });
      return { ok: true };
    }),

  unsubscribe: authedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({ where: { endpoint: input.endpoint, userId: ctx.user.id } });
      return { ok: true };
    }),

  /** ¿Este navegador ya está suscrito? (para pintar el botón de Ajustes). */
  isSubscribed: authedProcedure
    .input(z.object({ endpoint: z.string() }))
    .query(async ({ ctx, input }) => {
      const found = await ctx.db.pushSubscription.findFirst({
        where: { endpoint: input.endpoint, userId: ctx.user.id },
        select: { id: true },
      });
      return Boolean(found);
    }),
});
