/**
 * Servidor de edición simultánea (Yjs sobre WebSocket).
 *
 * Corre en su propio contenedor (notiono-collab) porque Next no mantiene
 * conexiones WebSocket largas en producción.
 *
 * A propósito NO conoce BlockNote: solo autentica, transporta y guarda el estado
 * Yjs en Page.ydoc. La versión legible del documento (Page.content, que usan la
 * búsqueda, la publicación, el export y las versiones) la sigue escribiendo el
 * editor del navegador con su autosave de siempre. Así este servicio es pequeño
 * y no hay que mantener el esquema de bloques en dos sitios.
 */
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { PrismaClient } from "@prisma/client";
import { verifyCollabToken } from "../src/server/collabToken";

const db = new PrismaClient();
const PORT = Number(process.env.COLLAB_PORT ?? 1234);


/**
 * La sala es el id de la página. El permiso llega como token firmado que emite la
 * web (pages.collabToken); aquí se vuelve a comprobar la pertenencia al espacio,
 * para que un token viejo no valga si a alguien se le retiró el acceso.
 */
async function authorize(token: string | null, pageId: string) {
  if (!token) return null;
  const claim = verifyCollabToken(token, pageId);
  if (!claim) return null;
  const session = { userId: claim.userId };

  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { workspaceId: true, archivedAt: true },
  });
  if (!page || page.archivedAt) return null;

  const member = await db.member.findUnique({
    where: { workspaceId_userId: { workspaceId: page.workspaceId, userId: session.userId } },
    select: { role: true },
  });
  if (!member) return null;
  return { userId: session.userId, role: member.role };
}

const server = new Server({
  port: PORT,
  address: "0.0.0.0",

  async onAuthenticate({ documentName, token, connectionConfig }) {
    const access = await authorize(token, documentName);
    if (!access) throw new Error("Sin acceso a esta página");
    // Los invitados de solo lectura ven los cambios en vivo pero no pueden escribir.
    connectionConfig.readOnly = access.role === "viewer";
    return { userId: access.userId, role: access.role };
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const page = await db.page.findUnique({ where: { id: documentName }, select: { ydoc: true } });
        return page?.ydoc ? new Uint8Array(page.ydoc) : null;
      },
      store: async ({ documentName, state }) => {
        await db.page
          .update({ where: { id: documentName }, data: { ydoc: Buffer.from(state) } })
          .catch(() => {
            // La página pudo borrarse mientras alguien la tenía abierta.
          });
      },
    }),
  ],
});

server.listen().then(() => console.log(`[collab] escuchando en el puerto ${PORT}`));
