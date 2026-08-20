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

/** Clic derecho sobre la pestaña de una vista: abre su menú de opciones. */
export const VIEW_MENU_EVENT = "notiono:menu-vista";
