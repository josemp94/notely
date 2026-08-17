"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción; en dev estorba con el HMR). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
