import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Notiono es SSO-only: no se siembra ningún usuario ni workspace.
// Cada persona y su espacio se crean automáticamente en su primer login por SSO.
async function main() {
  console.log("Seed: nada que sembrar (acceso por SSO).");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
