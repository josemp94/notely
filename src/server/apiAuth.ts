import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashApiToken } from "./routers/apiTokens";

export const jsonError = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

/**
 * Autentica una petición de /api/v1 por `Authorization: Bearer ntn_…`.
 * Devuelve el workspace al que está scopeado el token, o una respuesta 401.
 */
export async function authApiRequest(req: Request): Promise<{ workspaceId: string } | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const t = await db.apiToken.findUnique({ where: { tokenHash: hashApiToken(token) } });
    if (t) {
      await db.apiToken.update({ where: { id: t.id }, data: { lastUsed: new Date() } });
      return { workspaceId: t.workspaceId };
    }
  }
  return jsonError(401, "Token inválido o ausente. Usa 'Authorization: Bearer <token>'.");
}
