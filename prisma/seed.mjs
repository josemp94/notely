import { PrismaClient } from "@prisma/client";
import { generateKeyBetween } from "fractional-indexing";

const db = new PrismaClient();

async function main() {
  const user = await db.user.upsert({
    where: { email: "jose@notely.local" },
    update: {},
    create: { email: "jose@notely.local", name: "Jose", role: "admin" },
  });

  let workspace = await db.workspace.findFirst({ where: { ownerId: user.id } });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: { name: "Jose", icon: "🧡", ownerId: user.id },
    });
    await db.member.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
    });
  }

  const count = await db.page.count({ where: { workspaceId: workspace.id } });
  if (count === 0) {
    const welcome = [
      { type: "heading", props: { level: 1 }, content: "Bienvenido a Notely 🧡" },
      { type: "paragraph", content: "Este es tu espacio. Escribe, organiza, y deja que Dobby lo mantenga." },
      { type: "paragraph", content: 'Pulsa "+ Nueva" en la barra lateral para crear páginas.' },
    ];
    await db.page.create({
      data: {
        workspaceId: workspace.id,
        title: "Inicio",
        icon: "🏠",
        order: generateKeyBetween(null, null),
        content: welcome,
      },
    });
  }

  console.log("Seed OK:", { user: user.email, workspace: workspace.name });
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
