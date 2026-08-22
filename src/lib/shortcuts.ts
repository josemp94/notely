// Atajos de teclado globales de la app. El listener vive en AppShell y dispara
// estos eventos; cada componente reacciona al suyo (así no se duplica lógica).
export const NEW_PAGE_EVENT = "notiono:new-page";
export const TOGGLE_SIDEBAR_EVENT = "notiono:toggle-sidebar";

/** ¿El foco está en un campo de texto o en el editor? Entonces el atajo no debe actuar. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Abrir el menú de una vista donde está el ratón. Lleva el punto del clic porque el
 * menú tiene que salir ahí: antes colgaba del engranaje de la derecha, lejos de la
 * pestaña sobre la que se pinchaba.
 */
export const VIEW_MENU_EVENT = "notiono:menu-vista";
export type ViewMenuDetail = { x: number; y: number };

/** La ventana con todos los atajos («?» o Ctrl+/). */
export const SHORTCUTS_EVENT = "notiono:atajos";

/**
 * Abrir el popover de filtros de la barra desde el menú de una columna. Lleva el
 * collectionId para que no se abran los filtros de otra BD embebida en la misma página.
 */
export const FILTER_MENU_EVENT = "notiono:abrir-filtros";
export type FilterMenuDetail = { collectionId: string };
