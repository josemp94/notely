import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure que exige usuario + workspace resueltos (garantiza no-null en ctx). */
export const workspaceProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.workspace) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No hay usuario/workspace. ¿Ejecutaste el seed?",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace } });
});
