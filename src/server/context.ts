import { db } from "@/lib/db";

/**
 * Contexto de tRPC. En Fase 1 (mono-usuario, sin login todavía) resolvemos
 * el usuario y workspace sembrados. La autenticación real (Auth.js) llega en Fase 1b.
 */
export async function createContext() {
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const workspace = user
    ? await db.workspace.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
      })
    : null;

  return { db, user, workspace };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
