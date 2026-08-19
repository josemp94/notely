import { lookup } from "node:dns/promises";
import { TRPCError } from "@trpc/server";

export type LinkPreview = { url: string; title: string; description: string; image: string; siteName: string };

/**
 * ¿La IP pertenece a una red privada o especial? El servidor vive dentro de la red
 * de casa: sin este filtro, cualquiera podría usar la vista previa para sondear el
 * router, el NAS o servicios internos (SSRF).
 */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

const meta = (html: string, prop: string): string => {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
};

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

/** Descarga una página y saca sus etiquetas OpenGraph para la tarjeta de enlace. */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esa dirección no es válida." });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se admiten enlaces http y https." });
  }
  const { address } = await lookup(url.hostname).catch(() => ({ address: "" }));
  if (!address || isPrivateAddress(address)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No se pueden previsualizar direcciones de la red interna." });
  }

  const fallback: LinkPreview = { url: url.toString(), title: url.hostname, description: "", image: "", siteName: url.hostname };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Notiono/1.0 (+link preview)", Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html")) return fallback;
    // Con los primeros 200 KB sobra: el <head> va al principio.
    const html = (await res.text()).slice(0, 200_000);
    return {
      url: url.toString(),
      title: decode(meta(html, "og:title") || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url.hostname),
      description: decode(meta(html, "og:description") || meta(html, "description")).slice(0, 300),
      image: decode(meta(html, "og:image")),
      siteName: decode(meta(html, "og:site_name") || url.hostname),
    };
  } catch {
    // Sitio caído, lento o que bloquea bots: la tarjeta se queda con el dominio.
    return fallback;
  }
}
