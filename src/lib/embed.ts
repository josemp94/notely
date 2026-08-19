// Reconocimiento de enlaces de vídeo para el bloque "bookmark". Función pura: se comprueba en scripts/check.ts.

/** URL de reproductor incrustado si el enlace es de YouTube o Vimeo; null si no. */
export function embedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube.com${u.pathname}`;
    }
    if (host === "vimeo.com") return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    return null;
  } catch {
    return null;
  }
}

