"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { SearchPalette } from "@/components/SearchPalette";
import { Shortcuts } from "@/components/Shortcuts";
import { isTyping, NEW_PAGE_EVENT, SHORTCUTS_EVENT, TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";

const COLLAPSED_KEY = "notiono.sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // El plegado del panel se recuerda entre sesiones (solo escritorio).
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);
  const toggleSidebar = useCallback(
    () =>
      setCollapsed((c) => {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
        return !c;
      }),
    [],
  );

  /**
   * Atajos globales. Ctrl/Cmd+K lo lleva la propia paleta de búsqueda.
   * No se usa Ctrl+N para "nueva página" porque el navegador se lo queda.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // «?» a secas abre los atajos, como en tantos sitios; Ctrl+/ hace lo mismo
      // para quien tenga un teclado donde «?» pide dos dedos.
      if ((e.key === "?" || (mod && e.key === "/")) && !isTyping(e.target)) {
        e.preventDefault();
        window.dispatchEvent(new Event(SHORTCUTS_EVENT));
        return;
      }
      if (!mod) return;
      if (e.key === "\\") {
        e.preventDefault();
        window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT));
      } else if (e.altKey && e.key.toLowerCase() === "n" && !isTyping(e.target)) {
        e.preventDefault();
        window.dispatchEvent(new Event(NEW_PAGE_EVENT));
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggleSidebar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggleSidebar);
    };
  }, [toggleSidebar]);

  // Cerrar el panel al navegar (en móvil).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative flex h-dvh">
      <SearchPalette />
      <Shortcuts />
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
        } ${collapsed ? "md:hidden" : ""}`}
      >
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera solo móvil con botón de menú */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <span className="font-display font-bold">
            No<span className="text-brand">tio</span>no
          </span>
        </div>

        {/* Con el panel plegado (Ctrl+\\) queda este botón para recuperarlo. */}
        {collapsed && (
          <button
            onClick={toggleSidebar}
            className="absolute left-2 top-2 z-20 hidden rounded p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] md:block"
            title="Mostrar el panel (Ctrl+\\)"
          >
            <PanelLeft size={18} />
          </button>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
