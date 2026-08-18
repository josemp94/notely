import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/asset/:id — sirve los bytes de un asset con su content-type.
 * Pública a propósito: las portadas de páginas publicadas (/s/<token>) se ven sin
 * sesión. Solo entrega el asset pedido por id (cuid no adivinable), sin listar nada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return new Response("No encontrado", { status: 404 });
  return new Response(Buffer.from(asset.bytes), {
    headers: {
      "Content-Type": asset.mime,
      // Los assets son inmutables (nunca se reescriben): cache larga.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
