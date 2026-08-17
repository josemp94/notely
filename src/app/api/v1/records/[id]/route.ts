import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, jsonError } from "@/server/apiAuth";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const findRecord = (id: string, workspaceId: string) =>
  db.record.findFirst({ where: { id, collection: { page: { workspaceId } } } });

const patchSchema = z.object({ cells: z.record(z.string(), z.any()) });

/** PATCH /api/v1/records/:id — merge de celdas { cells }; null o "" borra la celda. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const rec = await findRecord(id, auth.workspaceId);
  if (!rec) return jsonError(404, "Registro no encontrado.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Cuerpo inválido.");

  const cells = { ...(rec.cells as Record<string, unknown>), ...parsed.data.cells };
  for (const [k, v] of Object.entries(parsed.data.cells)) {
    if (v === null || v === "") delete cells[k];
  }
  const updated = await db.record.update({
    where: { id: rec.id },
    data: { cells: cells as Prisma.InputJsonValue },
    select: { id: true, cells: true, parentId: true, updatedAt: true },
  });
  return NextResponse.json(updated);
}

/** DELETE /api/v1/records/:id — borra el registro (y sus hijos, por FK en cascada). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const rec = await findRecord(id, auth.workspaceId);
  if (!rec) return jsonError(404, "Registro no encontrado.");
  await db.record.delete({ where: { id: rec.id } });
  return NextResponse.json({ ok: true });
}
