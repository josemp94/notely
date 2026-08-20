/**
 * Crear páginas de documento, sin tRPC delante.
 *
 * Igual que el servicio de bases de datos: recibe el ámbito explícito para que
 * también pueda llamarlo la API REST, donde no hay sesión de navegador.
 */
import { db as defaultDb } from "@/lib/db";
import { rankAtEnd } from "@/lib/fractional";
import { dispatchWebhooks } from "@/server/webhooks";
import { DbError, type Scope } from "./db";

export async function createPage(
  scope: Scope,
  input: { title: string; parentId?: string | null; icon?: string | null },
) {
  if (input.parentId) {
    const padre = await scope.db.page.findFirst({
      where: { id: input.parentId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!padre) throw new DbError("not_found", "Página madre no encontrada.");
  }

  const last = await scope.db.page.findFirst({
    where: { workspaceId: scope.workspaceId, parentId: input.parentId ?? null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const creada = await scope.db.page.create({
    data: {
      workspaceId: scope.workspaceId,
      parentId: input.parentId ?? null,
      title: input.title,
      ...(input.icon ? { icon: input.icon } : {}),
      order: rankAtEnd(last?.order ?? null),
      content: [],
    },
  });

  dispatchWebhooks(scope.workspaceId, "page.created", {
    pageId: creada.id,
    title: creada.title,
    parentId: creada.parentId,
  });
  return creada;
}

/** Por si alguna llamada no trae su propio cliente de Prisma. */
export const defaultScope = (workspaceId: string, userId?: string | null): Scope => ({
  db: defaultDb,
  workspaceId,
  userId,
});
