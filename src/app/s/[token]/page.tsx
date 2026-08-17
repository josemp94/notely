import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { cellToText } from "@/server/routers/db";
import { PublicView } from "./PublicView";

// Ruta pública (sin sesión): solo expone la página cuyo publicToken coincide.
export default async function PublicShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await db.page.findUnique({ where: { publicToken: token } });
  if (!page || page.archivedAt) notFound();

  let table: { headers: string[]; rows: string[][] } | null = null;
  if (page.type === "database") {
    const col = await db.collection.findUnique({
      where: { pageId: page.id },
      include: {
        fields: { orderBy: { order: "asc" } },
        records: { orderBy: { order: "asc" } },
      },
    });
    // Campos computados (relación/rollup/fórmula) fuera: sus celdas no tienen valor legible.
    const fields = (col?.fields ?? []).filter((f) => !["relation", "rollup", "formula"].includes(f.type));
    table = {
      headers: fields.map((f) => f.name),
      rows: (col?.records ?? []).map((r) => {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        return fields.map((f) => cellToText(f, cells[f.id], r));
      }),
    };
  }

  return (
    <PublicView title={page.title} icon={page.icon} cover={page.cover} content={page.content} table={table} />
  );
}
