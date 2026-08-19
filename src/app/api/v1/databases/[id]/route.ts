import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authApiRequest, jsonError } from "@/server/apiAuth";

export const dynamic = "force-dynamic";

/** GET /api/v1/databases/:id — campos y registros de una base de datos. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const col = await db.collection.findFirst({
    where: { id, page: { workspaceId: auth.workspaceId } },
    select: {
      id: true,
      page: { select: { title: true, icon: true } },
      fields: { select: { id: true, name: true, type: true }, orderBy: { order: "asc" } },
      records: { where: { archivedAt: null }, select: { id: true, cells: true, parentId: true }, orderBy: { order: "asc" } },
    },
  });
  if (!col) return jsonError(404, "Base de datos no encontrada.");
  return NextResponse.json({
    id: col.id,
    title: col.page.title,
    icon: col.page.icon,
    fields: col.fields,
    records: col.records,
  });
}
