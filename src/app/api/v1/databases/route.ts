import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authApiRequest } from "@/server/apiAuth";

export const dynamic = "force-dynamic";

/** GET /api/v1/databases — bases de datos del workspace del token. */
export async function GET(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const cols = await db.collection.findMany({
    where: { page: { workspaceId: auth.workspaceId, archivedAt: null } },
    select: { id: true, page: { select: { title: true, icon: true } } },
  });
  return NextResponse.json(
    cols.map((c) => ({ id: c.id, title: c.page.title, icon: c.page.icon })),
  );
}
