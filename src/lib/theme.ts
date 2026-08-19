"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const EVENT = "notiono:theme";

/** Cambia el tema, lo persiste y avisa a los componentes suscritos (useTheme). */
export function setTheme(t: Theme) {
  localStorage.setItem("theme", t);
  document.documentElement.dataset.theme = t;
  window.dispatchEvent(new Event(EVENT));
}

/** Tema activo, reactivo. En SSR devuelve "light"; el script inline del layout fija el real antes de pintar. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
