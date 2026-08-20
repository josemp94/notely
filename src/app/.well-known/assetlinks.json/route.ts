import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Enlace entre el dominio y la app de Android (Digital Asset Links).
 *
 * El APK es una TWA: por dentro es Chrome abriendo esta misma web. Chrome solo le
 * quita la barra de direcciones si el dominio confirma, desde aquí, que ese APK es
 * suyo — y lo confirma comparando la huella con la que trae el APK instalado. Sin
 * este fichero la app funciona igual, pero se ve la barra del navegador arriba y
 * deja de parecer una app.
 *
 * La huella se saca del almacén de claves con el que se firma el APK:
 *   keytool -list -v -keystore notiono.keystore -alias notiono
 * y se pasa al contenedor en ANDROID_CERT_FINGERPRINT (los dos puntos incluidos).
 * Mientras no esté puesta, esto devuelve 404 en vez de un enlace roto: un
 * assetlinks mal formado es peor que no tenerlo, porque Chrome lo cachea.
 */
export function GET() {
  const huella = process.env.ANDROID_CERT_FINGERPRINT?.trim();
  const paquete = process.env.ANDROID_PACKAGE_NAME?.trim() || "com.monrealperez.notiono";
  if (!huella) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: paquete,
          sha256_cert_fingerprints: [huella],
        },
      },
    ],
    { headers: { "content-type": "application/json" } },
  );
}
