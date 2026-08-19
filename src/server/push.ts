import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Par de claves VAPID de la instalación. Se genera solo la primera vez y se guarda
 * en la base de datos: así el despliegue no necesita configurar nada a mano, y las
 * claves sobreviven a la recreación del contenedor (si cambiaran, todos los
 * navegadores suscritos dejarían de recibir avisos).
 */
async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  const rows = await db.appSetting.findMany({ where: { key: { in: ["vapidPublicKey", "vapidPrivateKey"] } } });
  const found = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (found.vapidPublicKey && found.vapidPrivateKey) {
    return { publicKey: found.vapidPublicKey, privateKey: found.vapidPrivateKey };
  }
  const keys = webpush.generateVAPIDKeys();
  await db.appSetting.createMany({
    data: [
      { key: "vapidPublicKey", value: keys.publicKey },
      { key: "vapidPrivateKey", value: keys.privateKey },
    ],
    skipDuplicates: true, // si dos peticiones llegan a la vez, gana la primera
  });
  const after = await db.appSetting.findMany({ where: { key: { in: ["vapidPublicKey", "vapidPrivateKey"] } } });
  const final = Object.fromEntries(after.map((r) => [r.key, r.value]));
  return { publicKey: final.vapidPublicKey, privateKey: final.vapidPrivateKey };
}

/** Clave pública que el navegador necesita para suscribirse. */
export async function publicVapidKey(): Promise<string> {
  return (await vapid()).publicKey;
}

/**
 * Envía un aviso push a todos los dispositivos del usuario. No espera al resultado
 * ni rompe la operación que lo provocó; las suscripciones caducadas (404/410) se
 * borran solas, que es como se limpian los navegadores que ya no existen.
 */
export function sendPush(userId: string, payload: { title: string; body: string; url?: string }): void {
  void (async () => {
    try {
      const subs = await db.pushSubscription.findMany({ where: { userId } });
      if (!subs.length) return;
      const keys = await vapid();
      webpush.setVapidDetails("mailto:notiono@monrealperez.com", keys.publicKey, keys.privateKey);
      const body = JSON.stringify(payload);
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              body,
            );
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              // El navegador ya no existe (desinstalado, permiso revocado): se limpia.
              await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            } else {
              // Cualquier otro fallo (cifrado, red, servicio del navegador caído) queda
              // en el log del contenedor: si no, un push roto sería invisible.
              console.warn("[push] fallo enviando a", s.endpoint.slice(0, 60), err);
            }
          }
        }),
      );
    } catch {
      // Un fallo enviando avisos nunca debe romper lo que los provocó.
    }
  })();
}
