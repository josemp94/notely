import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createContext } from "@/server/context";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** POST /api/upload — multipart con campo "file" (imagen). Devuelve { id, url } para usar como portada. */
export async function POST(req: Request) {
  const ctx = await createContext({ req });
  if (!ctx.user || !ctx.workspace || ctx.role === "viewer") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el campo «file»." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen no puede superar los 8 MB." }, { status: 413 });
  }

  const asset = await db.asset.create({
    data: {
      workspaceId: ctx.workspace.id,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      createdById: ctx.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: asset.id, url: `/api/asset/${asset.id}` });
}
