#!/usr/bin/env node
/**
 * Deja el APK ya firmado dentro de la web, para que se descargue desde Ajustes.
 *
 *   npm run apk:publicar [ruta/al/app-release-signed.apk]
 *
 * Copia el APK a `public/` (Next sirve esa carpeta tal cual, y el Dockerfile la mete
 * en la imagen: así el APK viaja con el despliegue y nadie tiene que pasárselo por
 * WhatsApp) y anota versión, tamaño y fecha en `src/lib/apk.json`, que es lo que
 * enseña la pantalla de Ajustes. La versión sale de `android/twa-manifest.json`, que
 * es la que se acaba de compilar: así no hay dos sitios que puedan discrepar.
 */
import { copyFileSync, readFileSync, statSync, writeFileSync } from "node:fs";

const origen = process.argv[2] ?? "android/app-release-signed.apk";
const destino = "public/notiono.apk";

const twa = JSON.parse(readFileSync("android/twa-manifest.json", "utf8"));
copyFileSync(origen, destino);

const info = {
  version: twa.appVersion,
  versionCode: twa.appVersionCode,
  bytes: statSync(destino).size,
  fecha: new Date().toISOString().slice(0, 10),
};
writeFileSync("src/lib/apk.json", JSON.stringify(info, null, 2) + "\n");

console.log(`${origen} → ${destino}`);
console.log(`  versión ${info.version} (código ${info.versionCode}), ${(info.bytes / 1024 / 1024).toFixed(1)} MB`);
console.log("  Recuerda commitear los dos ficheros: el APK viaja en el repo.");
