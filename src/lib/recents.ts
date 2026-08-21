// Últimas páginas visitadas, por workspace, en localStorage. Se enseñan en el
// buscador (Ctrl+K) al abrirlo vacío, como hace Notion — no en el sidebar.
export type Recent = { pageId: string; title: string; icon: string | null; ts: number };

export const RECENTS_EVENT = "notiono:recents";
const MAX_RECENTS = 8;

const key = (workspaceId: string) => `notiono.recents.${workspaceId}`;

export function getRecents(workspaceId: string): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(key(workspaceId)) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}

export function pushRecent(workspaceId: string, page: { id: string; title: string; icon: string | null }) {
  const list: Recent[] = [
    { pageId: page.id, title: page.title, icon: page.icon, ts: Date.now() },
    ...getRecents(workspaceId).filter((r) => r.pageId !== page.id),
  ].slice(0, MAX_RECENTS);
  localStorage.setItem(key(workspaceId), JSON.stringify(list));
  window.dispatchEvent(new Event(RECENTS_EVENT));
}
