import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, jsonFromDbError, readJson } from "@/server/apiAuth";
import { createRecord } from "@/server/services/db";

export const dynamic = "force-dynamic";

const nuevoRegistro = z.object({
  cells: z.record(z.string(), z.any()).default({}),
  parentId: z.string().optional(),
});

/**
 * POST /api/v1/databases/:id/records — crea un registro { cells, parentId? }.
 *
 * Misma respuesta que siempre. Lo que cambia por dentro es que ahora pasa por el
 * mismo servicio que usa la web: hasta ahora esta ruta traía su propia copia y se
 * dejaba por el camino los webhooks y el «creado por».
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevoRegistro);
  if (body instanceof Response) return body;
  const { id } = await params;

  try {
    const rec = await createRecord(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      { collectionId: id, cells: body.data.cells, parentId: body.data.parentId },
    );
    return NextResponse.json(
      { id: rec.id, cells: rec.cells, parentId: rec.parentId, createdAt: rec.createdAt },
      { status: 201 },
    );
  } catch (e) {
    return jsonFromDbError(e);
  }
}
