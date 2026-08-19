import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Tipos que se muestran incrustados en la página (portadas, previsualización de adjuntos).
 * Deliberadamente SIN image/svg+xml: un SVG es un documento que puede ejecutar JavaScript,
 * y estos ficheros se sirven desde nuestro propio dominio.
 */
const INLINE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

/** Comillas y saltos fuera: el nombre va dentro de una cabecera HTTP. */
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "archivo";

/**
 * GET /api/asset/:id — sirve los bytes de un asset con su content-type.
 * Pública a propósito: las portadas de páginas publicadas (/s/<token>) se ven sin
 * sesión. Solo entrega el asset pedido por id (cuid no adivinable), sin listar nada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset) return new Response("No encontrado", { status: 404 });
  const inline = INLINE_MIME.has(asset.mime);
  return new Response(Buffer.from(asset.bytes), {
    headers: {
      "Content-Type": asset.mime,
      // Todo lo que no sea imagen/PDF conocido se descarga en vez de renderizarse:
      // evita HTML o SVG con scripts ejecutándose en nuestro dominio.
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName(asset.name ?? "archivo")}"`,
      "X-Content-Type-Options": "nosniff",
      // Los assets son inmutables (nunca se reescriben): cache larga.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
