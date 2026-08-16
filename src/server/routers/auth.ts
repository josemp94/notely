import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateKeyBetween } from "fractional-indexing";
import { router, publicProcedure, workspaceProcedure } from "../trpc";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  sessionCookie,
  SESSION_MAX_AGE,
} from "../auth";

type DB = typeof import("@/lib/db").db;

async function ensureWorkspace(db: DB, user: { id: string; name: string | null }) {
  let ws = await db.workspace.findFirst({ where: { ownerId: user.id } });
  if (!ws) {
    ws = await db.workspace.create({
      data: { name: user.name ?? "Mi espacio", icon: "🧡", ownerId: user.id },
    });
    await db.member.create({ data: { workspaceId: ws.id, userId: user.id, role: "owner" } });
    await db.page.create({
      data: {
        workspaceId: ws.id,
        title: "Inicio",
        icon: "🏠",
        order: generateKeyBetween(null, null),
        content: [
          { type: "heading", props: { level: 1 }, content: "Bienvenido a Notely 🧡" },
          { type: "paragraph", content: "Este es tu espacio. Escribe, organiza y crea bases de datos." },
          { type: "paragraph", content: 'Pulsa "+ Página" o "+ BD" en la barra lateral para empezar.' },
        ],
      },
    });
  }
  return ws;
}

function setSessionCookie(ctx: { resHeaders?: Headers }, token: string) {
  ctx.resHeaders?.append("Set-Cookie", sessionCookie(token, SESSION_MAX_AGE));
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) =>
    ctx.user ? { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name } : null,
  ),

  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6, "Mínimo 6 caracteres"),
        name: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const exists = await ctx.db.user.findUnique({ where: { email } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Ese email ya está registrado." });
      const user = await ctx.db.user.create({
        data: { email, name: input.name || null, passwordHash: hashPassword(input.password), role: "member" },
      });
      await ensureWorkspace(ctx.db, user);
      const token = await createSession(user.id);
      setSessionCookie(ctx, token);
      return { id: user.id, email: user.email, name: user.name };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const user = await ctx.db.user.findUnique({ where: { email } });
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email o contraseña incorrectos." });
      }
      await ensureWorkspace(ctx.db, user);
      const token = await createSession(user.id);
      setSessionCookie(ctx, token);
      return { id: user.id, email: user.email, name: user.name };
    }),

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

  changePassword: workspaceProcedure
    .input(z.object({ current: z.string().optional(), next: z.string().min(6, "Mínimo 6 caracteres") }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: ctx.user.id } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      // Si ya tiene contraseña, exige la actual correcta. Si no (cuenta OIDC), permite fijar una.
      if (user.passwordHash) {
        if (!verifyPassword(input.current ?? "", user.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "La contraseña actual no es correcta." });
        }
      }
      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(input.next) },
      });
      return { ok: true };
    }),
});
