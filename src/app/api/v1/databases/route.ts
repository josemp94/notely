import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authApiRequest, jsonFromDbError, readJson } from "@/server/apiAuth";
import { createDatabase, FIELD_TYPES, VIEW_TYPES } from "@/server/services/db";

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

const nuevaBd = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(8).optional(),
  parentId: z.string().optional(),
  fields: z.array(z.object({ name: z.string().min(1).max(80), type: z.enum(FIELD_TYPES) })).optional(),
  views: z.array(z.object({ type: z.enum(VIEW_TYPES), name: z.string().max(60).optional() })).optional(),
});

/**
 * POST /api/v1/databases — crea una base de datos con sus columnas y vistas.
 *
 * Sin `fields` nace con una columna de texto, y sin `views` con una vista Tabla: una
 * base de datos sin ninguna de las dos no se puede ni abrir. A diferencia de la que
 * se crea desde la web, nace SIN filas de ejemplo: quien la crea por API quiere la
 * estructura, no tres filas vacías que luego hay que borrar.
 */
export async function POST(req: Request) {
  const auth = await authApiRequest(req);
  if (auth instanceof Response) return auth;
  const body = await readJson(req, nuevaBd);
  if (body instanceof Response) return body;

  try {
    const { page, collection, fields, views } = await createDatabase(
      { db, workspaceId: auth.workspaceId, userId: auth.userId },
      {
        title: body.data.name,
        icon: body.data.icon,
        parentId: body.data.parentId,
        fields: body.data.fields,
        views: body.data.views,
        seedRows: 0,
      },
    );
    return NextResponse.json(
      {
        id: collection.id,
        pageId: page.id,
        title: page.title,
        icon: page.icon,
        fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
        views: views.map((v) => ({ id: v.id, name: v.name, type: v.type })),
      },
      { status: 201 },
    );
  } catch (e) {
    return jsonFromDbError(e);
  }
}
