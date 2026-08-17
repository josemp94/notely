"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { SearchPalette } from "@/components/SearchPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el panel al navegar (en móvil).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-dvh">
      <SearchPalette />
      {/* Fondo oscuro al abrir el panel en móvil */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Barra lateral: cajón deslizante en móvil, fija en escritorio */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera solo móvil con botón de menú */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded p-1 text-xl leading-none text-[var(--muted)] hover:text-brand"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="font-display font-bold">
            No<span className="text-brand">tio</span>no
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
