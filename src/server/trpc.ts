import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Procedure que solo exige usuario autenticado (sin espacio). */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No autenticado." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Procedure que exige usuario + espacio activo. Además, en mutaciones, bloquea a
 * los `viewer` (solo lectura) de forma centralizada: cubre todos los routers.
 */
export const workspaceProcedure = t.procedure.use(({ ctx, type, next }) => {
  if (!ctx.user || !ctx.workspace) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No hay usuario/espacio activo." });
  }
  if (type === "mutation" && ctx.role === "viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo lectura: no tienes permiso de edición en este espacio.",
    });
  }
  return next({
    ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace, role: ctx.role ?? "viewer" },
  });
});
