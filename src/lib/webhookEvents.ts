// Lista de eventos de los avisos salientes. Vive aparte del módulo que los envía
// porque también la usa la pantalla de Ajustes, que corre en el navegador: si se
// importara de src/server/webhooks.ts, Prisma acabaría en el bundle del cliente.
export const WEBHOOK_EVENTS = [
  "record.created",
  "record.updated",
  "record.deleted",
  "page.created",
  "page.published",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
