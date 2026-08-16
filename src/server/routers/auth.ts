import { z } from "zod";
import { router, publicProcedure, workspaceProcedure } from "../trpc";
import { destroySession, sessionCookie } from "../auth";

// Notely es SSO-only. El alta de usuarios ocurre en el callback OIDC (/api/auth/oidc/callback).
export const authRouter = router({
  me: publicProcedure.query(({ ctx }) =>
    ctx.user ? { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, role: ctx.user.role } : null,
  ),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await destroySession(ctx.sessionToken);
    ctx.resHeaders?.append("Set-Cookie", sessionCookie("", 0));
    return { ok: true };
  }),

  updateProfile: workspaceProcedure
    .input(z.object({ name: z.string().trim().max(120) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({ where: { id: ctx.user.id }, data: { name: input.name || null } });
      return { ok: true };
    }),
});
