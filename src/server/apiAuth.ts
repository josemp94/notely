import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ZodError } from "zod";
import { hashApiToken } from "./routers/apiTokens";
import { DbError } from "./services/db";

export const jsonError = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

/**
 * Autentica una petición de /api/v1 por `Authorization: Bearer ntn_…`.
 * Devuelve el workspace al que está scopeado el token, o una respuesta 401.
 */
export async function authApiRequest(
  req: Request,
): Promise<{ workspaceId: string; userId: string | null } | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const t = await db.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } });
    if (t) {
      await db.apiToken.update({ where: { id: t.id }, data: { lastUsed: new Date() } });
      // Quien creó el token responde de lo que se haga con él: así lo hecho por API
      // queda firmado con un nombre y no aparece como salido de la nada.
      return { workspaceId: t.workspaceId, userId: t.createdById };
    }
  }
  return jsonError(401, "Token inválido o ausente. Usa 'Authorization: Bearer <token>'.");
}

/**
 * Lee y valida el cuerpo JSON. Devuelve el error ya montado si no vale, para que
 * cada ruta no repita el mismo try/catch y el mismo 400.
 */
export async function readJson<T>(
  req: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
): Promise<{ data: T } | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    const donde = i?.path?.length ? `${i.path.join(".")}: ` : "";
    return jsonError(400, `${donde}${i?.message ?? "Cuerpo inválido."}`);
  }
  return { data: parsed.data };
}

/**
 * Traduce los errores del servicio de bases de datos a HTTP. El servicio habla de
 * intenciones (no encontrado / petición inválida) y no sabe que hay HTTP delante.
 */
export function jsonFromDbError(e: unknown): NextResponse {
  if (e instanceof DbError) return jsonError(e.code === "not_found" ? 404 : 400, e.message);
  console.error("[api/v1]", e);
  return jsonError(500, "Error interno.");
}
