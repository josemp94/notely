import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createContext } from "@/server/context";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * POST /api/upload — multipart con campo "file". Devuelve { id, url, name, mime }.
 * Sirve para portadas de página (solo imágenes: `?kind=image`) y para adjuntos de
 * base de datos (cualquier tipo). Los bytes se guardan en Postgres (modelo Asset).
 */
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
  // Las portadas piden explícitamente imagen; los adjuntos aceptan cualquier tipo.
  if (new URL(req.url).searchParams.get("kind") === "image" && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo no puede superar los 8 MB." }, { status: 413 });
  }

  const asset = await db.asset.create({
    data: {
      workspaceId: ctx.workspace.id,
      mime: file.type || "application/octet-stream",
      name: file.name || null,
      bytes: Buffer.from(await file.arrayBuffer()),
      createdById: ctx.user.id,
    },
    select: { id: true, name: true, mime: true },
  });
  return NextResponse.json({ id: asset.id, url: `/api/asset/${asset.id}`, name: asset.name, mime: asset.mime });
}
