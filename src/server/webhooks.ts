import crypto from "node:crypto";
import { db } from "@/lib/db";

export const WEBHOOK_EVENTS = ["record.created", "record.updated", "record.deleted"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Firma del cuerpo, para que quien recibe pueda comprobar que el aviso es nuestro. */
export function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Envía un aviso a los webhooks del espacio suscritos a ese evento.
 *
 * No se espera al resultado ni se corta la petición del usuario: un servicio
 * caído no puede impedir que se guarde una fila. Tampoco se filtran las URLs
 * internas (a diferencia de la vista previa de enlaces): aquí el destino lo fija
 * el dueño del espacio en Ajustes y el caso normal es justamente avisar a un
 * servicio de la red de casa; además el cuerpo va firmado y nunca se devuelve
 * al navegador nada de la respuesta.
 */
export function dispatchWebhooks(workspaceId: string, event: WebhookEvent, data: unknown): void {
  void (async () => {
    try {
      const hooks = await db.webhook.findMany({ where: { workspaceId, active: true } });
      const targets = hooks.filter((h) => h.events.split(",").includes(event));
      if (!targets.length) return;
      const body = JSON.stringify({ event, workspaceId, at: new Date().toISOString(), data });
      await Promise.all(
        targets.map(async (hook) => {
          let status = 0;
          try {
            const res = await fetch(hook.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Notiono-Event": event,
                "X-Notiono-Signature": signPayload(hook.secret, body),
              },
              body,
              signal: AbortSignal.timeout(5000),
            });
            status = res.status;
          } catch {
            status = 0; // no respondió: se anota para poder diagnosticarlo en Ajustes
          }
          await db.webhook.update({
            where: { id: hook.id },
            data: { lastStatus: status, lastAt: new Date() },
          });
        }),
      );
    } catch {
      // Un fallo enviando avisos nunca debe romper la operación que los provocó.
    }
  })();
}
