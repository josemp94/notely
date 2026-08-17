import crypto from "crypto";
import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

export const hashApiToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

/** Tokens de la API REST (/api/v1), scopeados al workspace activo. */
export const apiTokensRouter = router({
  list: workspaceProcedure.query(({ ctx }) =>
    ctx.db.apiToken.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, lastUsed: true },
    }),
  ),

  /** Crea un token; el valor en claro solo se devuelve aquí (en BD queda su sha256). */
  create: workspaceProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const token = `ntn_${crypto.randomBytes(24).toString("base64url")}`;
      await ctx.db.apiToken.create({
        data: {
          name: input.name,
          tokenHash: hashApiToken(token),
          workspaceId: ctx.workspace.id,
          createdById: ctx.user.id,
        },
      });
      return { token };
    }),

  revoke: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.apiToken.deleteMany({ where: { id: input.id, workspaceId: ctx.workspace.id } });
      return { ok: true };
    }),
});
