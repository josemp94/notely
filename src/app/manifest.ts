import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Notiono",
    short_name: "Notiono",
    description: "Tu espacio: notas, bases de datos y gráficas reales. Self-hosted.",
    start_url: "/",
    display: "standalone",
    // El mismo naranja que el icono: la pantalla de arranque es una N blanca sobre
    // la marca, no un destello en blanco.
    background_color: "#ff5c28",
    theme_color: "#ff5c28",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // El icono es full-bleed (fondo naranja hasta el borde), así que vale también como maskable.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
