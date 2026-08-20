import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "notiono",
    ts: new Date().toISOString(),
    // Para poder comprobar el despliegue desde fuera: la edición simultánea se
    // activa solo si esta variable llegó al build (se incrusta al compilar, así
    // que un despliegue sin ella deja la colaboración apagada sin avisar).
    collab: process.env.NEXT_PUBLIC_COLLAB_URL || null,
  });
}
