import { db } from "@/lib/db";
import { getSessionUser, parseCookie, SESSION_COOKIE } from "./auth";

/**
 * Contexto de tRPC. La sesión se resuelve desde la cookie de sesión (Fase 4: auth real).
 * `resHeaders` permite a los procedimientos de auth fijar/limpiar la cookie.
 */
export async function createContext(opts?: { req?: Request; resHeaders?: Headers }) {
  const token = parseCookie(opts?.req?.headers.get("cookie") ?? null, SESSION_COOKIE);
  const user = await getSessionUser(token);
  const workspace = user
    ? await db.workspace.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
      })
    : null;

  return { db, user, workspace, sessionToken: token, resHeaders: opts?.resHeaders };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
