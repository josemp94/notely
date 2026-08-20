import crypto from "node:crypto";
import { db } from "@/lib/db";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhookEvents";

export { WEBHOOK_EVENTS, type WebhookEvent };

/** Esperas entre reintentos. Tres intentos bastan para un servicio que se reinicia. */
const REINTENTOS_MS = [1000, 5000, 25000];


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
          const status = await deliver(hook.url, hook.secret, event, body);
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

/**
 * Envía el aviso y reintenta si el destino no responde o falla por su lado (5xx).
 * Un rechazo del propio destino (4xx) no se reintenta: reintentarlo daría igual.
 * Devuelve el código del último intento (0 = no respondió).
 */
export async function deliver(url: string, secret: string, event: string, body: string): Promise<number> {
  let status = 0;
  for (let intento = 0; intento <= REINTENTOS_MS.length; intento++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Notiono-Event": event,
          "X-Notiono-Signature": signPayload(secret, body),
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (res.ok || (res.status >= 400 && res.status < 500)) return status;
    } catch {
      status = 0; // no respondió (servicio caído, DNS, timeout…)
    }
    const espera = REINTENTOS_MS[intento];
    if (espera === undefined) break;
    await new Promise((r) => setTimeout(r, espera));
  }
  return status;
}
