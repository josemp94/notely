import { generateKeyBetween } from "fractional-indexing";

type DB = typeof import("@/lib/db").db;

/** Garantiza que el usuario tenga un workspace propio (con página de inicio). */
export async function ensureWorkspace(db: DB, user: { id: string; name: string | null }) {
  let ws = await db.workspace.findFirst({ where: { ownerId: user.id } });
  if (!ws) {
    ws = await db.workspace.create({
      data: { name: user.name ?? "Mi espacio", icon: "🧡", ownerId: user.id },
    });
    await db.member.create({ data: { workspaceId: ws.id, userId: user.id, role: "owner" } });
    await db.page.create({
      data: {
        workspaceId: ws.id,
        title: "Inicio",
        icon: "🏠",
        order: generateKeyBetween(null, null),
        content: [
          { type: "heading", props: { level: 1 }, content: "Bienvenido a Notely 🧡" },
          { type: "paragraph", content: "Este es tu espacio. Escribe, organiza y crea bases de datos." },
          { type: "paragraph", content: 'Pulsa "+ Página" o "+ BD" en la barra lateral para empezar.' },
        ],
      },
    });
  }
  return ws;
}
