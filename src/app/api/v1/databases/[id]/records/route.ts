import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rankAtEnd } from "@/lib/fractional";
import { authApiRequest, jsonError } from "@/server/apiAuth";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  cells: z.record(z.string(), z.any()).default({}),
  parentId: z.string().optional(),
});

/** POST /api/v1/databases/:id/records — crea un registro { cells, parentId? }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const col = await db.collection.findFirst({
    where: { id, page: { workspaceId: auth.workspaceId } },
    select: { id: true },
  });
  if (!col) return jsonError(404, "Base de datos no encontrada.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Cuerpo inválido.");

  if (parsed.data.parentId) {
    const parent = await db.record.findFirst({
      where: { id: parsed.data.parentId, collectionId: col.id },
      select: { id: true },
    });
    if (!parent) return jsonError(400, "parentId no pertenece a esta base de datos.");
  }

  const last = await db.record.findFirst({
    where: { collectionId: col.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const maxSeq = await db.record.aggregate({ where: { collectionId: col.id }, _max: { seq: true } });
  const rec = await db.record.create({
    data: {
      collectionId: col.id,
      parentId: parsed.data.parentId,
      order: rankAtEnd(last?.order ?? null),
      seq: (maxSeq._max.seq ?? 0) + 1,
      cells: parsed.data.cells as Prisma.InputJsonValue,
    },
    select: { id: true, cells: true, parentId: true, createdAt: true },
  });
  return NextResponse.json(rec, { status: 201 });
}
