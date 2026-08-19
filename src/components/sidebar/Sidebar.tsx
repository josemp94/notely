"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BlockNoteEditor } from "@blocknote/core";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  CircleCheck,
  PanelLeftClose,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { trpc } from "@/trpc/react";
import { NEW_PAGE_EVENT, TOGGLE_SIDEBAR_EVENT } from "@/lib/shortcuts";
import { parseCsv } from "@/lib/csv";
import { TEMPLATES } from "@/lib/templates";
import { getRecents, RECENTS_EVENT, type Recent } from "@/lib/recents";
import { setTheme, useTheme } from "@/lib/theme";
import { openSearchPalette } from "@/components/SearchPalette";
import { MovePageModal } from "@/components/MovePage";

type Node = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: string;
  hasChildren: boolean;
};

// Id de la página que se está arrastrando (solo puede haber un drag a la vez).
let draggedId: string | null = null;

/** ¿Está `id` dentro del subárbol de `rootId`? (para no soltar una página en sí misma) */
function isInSubtree(id: string, rootId: string, parentById: Map<string, string | null>): boolean {
  let cur: string | null = id;
  while (cur) {
    if (cur === rootId) return true;
    cur = parentById.get(cur) ?? null;
  }
  return false;
}

export function Sidebar() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: pages } = trpc.pages.tree.useQuery();
  const canEdit = me?.wsRole !== "viewer";
  const [showTemplates, setShowTemplates] = useState(false);

  const create = trpc.pages.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });
  // Atajo Ctrl/Cmd+Alt+N: reutiliza esta misma mutación en vez de duplicarla en el shell.
  const createMutate = create.mutate;
  useEffect(() => {
    if (!canEdit) return;
    const h = () => createMutate({ parentId: null });
    window.addEventListener(NEW_PAGE_EVENT, h);
    return () => window.removeEventListener(NEW_PAGE_EVENT, h);
  }, [canEdit, createMutate]);

  const createDb = trpc.db.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });

  // Importar: un solo botón para .md (página) y .csv (base de datos), según extensión.
  const importInput = useRef<HTMLInputElement>(null);
  const createPage = trpc.pages.create.useMutation();
  const updateContent = trpc.pages.updateContent.useMutation();
  const importCsv = trpc.db.importCsv.useMutation();

  async function onImportFile(file: File) {
    const text = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "");
    try {
      let pageId: string;
      if (/\.csv$/i.test(file.name)) {
        const rows = parseCsv(text);
        if (rows.length === 0) {
          window.alert("El CSV está vacío.");
          return;
        }
        const page = await importCsv.mutateAsync({
          name: title || "Base de datos",
          headers: rows[0],
          rows: rows.slice(1),
        });
        pageId = page.id;
      } else {
        const blocks = BlockNoteEditor.create().tryParseMarkdownToBlocks(text);
        const page = await createPage.mutateAsync({ parentId: null, title });
        await updateContent.mutateAsync({ id: page.id, content: blocks });
        pageId = page.id;
      }
      await utils.pages.tree.invalidate();
      router.push(`/p/${pageId}`);
    } catch (e) {
      window.alert(`No se pudo importar el archivo: ${e instanceof Error ? e.message : e}`);
    }
  }

  const byParent = new Map<string | null, Node[]>();
  const parentById = new Map<string, string | null>();
  for (const p of pages ?? []) {
    const arr = byParent.get(p.parentId) ?? [];
    arr.push(p);
    byParent.set(p.parentId, arr);
    parentById.set(p.id, p.parentId);
  }

  return (
    <aside className="flex h-dvh w-64 flex-col border-r border-[var(--border)]">
      <div className="flex items-center justify-between px-4 pt-4">
        <Link href="/" className="font-display text-lg font-bold">
          No<span className="text-brand">tio</span>no
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {canEdit && (
            <>
              <button
                onClick={() => create.mutate({ parentId: null })}
                className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
                title="Nueva página"
              >
                <FilePlus size={16} />
              </button>
              <button
                onClick={() => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT))}
                className="hidden rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand md:block"
                title="Plegar el panel (Ctrl+\\)"
              >
                <PanelLeftClose size={16} />
              </button>
              <button
                onClick={() => createDb.mutate({ parentId: null })}
                className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
                title="Nueva base de datos"
              >
                <Database size={16} />
              </button>
              <button
                onClick={() => importInput.current?.click()}
                className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
                title="Importar Markdown (página) o CSV (base de datos)"
              >
                <Upload size={16} />
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".md,.markdown,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ""; // permite reimportar el mismo archivo
                  if (f) onImportFile(f);
                }}
              />
            </>
          )}
        </div>
      </div>

      <WorkspaceBar me={me} />

      <button
        onClick={openSearchPalette}
        className="mx-2 mb-1 flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--muted)] hover:bg-[var(--border)]/40 hover:text-[var(--foreground)]"
      >
        <Search size={16} /> Buscar
        <span className="ml-auto font-mono text-[10px] text-[var(--muted)]">Ctrl K</span>
      </button>

      <NotificationsBell />

      {canEdit && (
        <button
          onClick={() => setShowTemplates(true)}
          className="mx-2 mb-1 flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--muted)] hover:bg-[var(--border)]/40 hover:text-[var(--foreground)]"
          title="Crear desde una plantilla"
        >
          <Sparkles size={16} /> Plantillas
        </button>
      )}
      {showTemplates && <TemplatesGallery onClose={() => setShowTemplates(false)} />}

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <Favorites />
        <Recents workspaceId={me?.workspace?.id} pages={pages} />
        <Tree nodes={byParent.get(null) ?? []} byParent={byParent} parentById={parentById} depth={0} canEdit={canEdit} />
      </nav>
      <Link
        href="/my-tasks"
        className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:text-brand"
      >
        <CircleCheck size={16} /> Mis tareas
      </Link>
      <Link
        href="/trash"
        className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] hover:text-brand"
      >
        <Trash2 size={16} /> Papelera
      </Link>
      <AccountFooter me={me} />
    </aside>
  );
}

/** Sección plegable del sidebar (Favoritos / Recientes). */
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        {icon}
        {title}
        <span className="ml-auto">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {open && children}
    </div>
  );
}

function SectionLink({ page }: { page: { id: string; title: string; icon: string | null } }) {
  const pathname = usePathname();
  const active = pathname === `/p/${page.id}`;
  return (
    <Link
      href={`/p/${page.id}`}
      className={`flex items-center gap-1 truncate rounded-md px-2 py-1 text-sm ${
        active ? "bg-brand-50 text-brand" : "hover:bg-[var(--border)]/40"
      }`}
    >
      <span className="truncate">
        {page.icon ? `${page.icon} ` : <FileText size={13} className="mr-1 inline align-[-2px]" />}
        {page.title || "Sin título"}
      </span>
    </Link>
  );
}

/** Favoritos del usuario (por encima del árbol). */
function Favorites() {
  const { data: favs } = trpc.favorites.list.useQuery();
  if (!favs?.length) return null;
  return (
    <Section icon={<Star size={12} />} title="Favoritos">
      {favs.map((p) => (
        <SectionLink key={p.id} page={p} />
      ))}
    </Section>
  );
}

/** Últimas páginas visitadas (localStorage, por workspace). */
function Recents({ workspaceId, pages }: { workspaceId: string | undefined; pages: Node[] | undefined }) {
  const [recents, setRecents] = useState<Recent[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    const load = () => setRecents(getRecents(workspaceId));
    load();
    window.addEventListener(RECENTS_EVENT, load);
    return () => window.removeEventListener(RECENTS_EVENT, load);
  }, [workspaceId]);

  // Solo páginas vivas, con título/icono frescos del árbol (lo guardado puede estar obsoleto).
  const byId = new Map((pages ?? []).map((p) => [p.id, p]));
  const items = recents.flatMap((r) => byId.get(r.pageId) ?? []);
  if (!items.length) return null;
  return (
    <Section icon={<Clock size={12} />} title="Recientes">
      {items.map((p) => (
        <SectionLink key={p.id} page={p} />
      ))}
    </Section>
  );
}

function when(d: Date) {
  return d.toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Campana con contador de no leídas y bandeja de notificaciones (menciones @persona). */
function NotificationsBell() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: unread } = trpc.notifications.unreadCount.useQuery();
  const { data: items } = trpc.notifications.list.useQuery(undefined, { enabled: open });
  const refresh = () =>
    Promise.all([utils.notifications.list.invalidate(), utils.notifications.unreadCount.invalidate()]);
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: refresh });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });

  // Al abrir la app se buscan vencimientos (como la purga de la papelera: sin cron).
  const checkDue = trpc.notifications.checkDue.useMutation({
    onSuccess: (r) => {
      if (r.created > 0) refresh();
    },
    onError: () => {},
  });
  const checkDueMutate = checkDue.mutate;
  useEffect(() => checkDueMutate(), [checkDueMutate]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-2 mb-1 flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--muted)] hover:bg-[var(--border)]/40 hover:text-[var(--foreground)]"
        title="Notificaciones"
      >
        <Bell size={16} /> Notificaciones
        {!!unread && (
          <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-medium leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
            <div
              className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pb-2 pt-4">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <Bell size={18} /> Notificaciones
                </h2>
                <div className="flex items-center gap-2">
                  {!!unread && (
                    <button
                      onClick={() => markAll.mutate()}
                      disabled={markAll.isPending}
                      className="rounded px-2 py-1 text-xs text-[var(--muted)] hover:bg-brand-50 hover:text-brand disabled:opacity-50"
                    >
                      Marcar todas como leídas
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="text-[var(--muted)] hover:text-brand" title="Cerrar">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto px-2 pb-3">
                {(items ?? []).length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Nada por aquí: ni menciones ni vencimientos.</p>
                )}
                {(items ?? []).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markRead.mutate({ id: n.id });
                      setOpen(false);
                      if (n.page) router.push(`/p/${n.page.id}`);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--border)]/30"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={n.read ? "text-[var(--muted)]" : ""}>
                        {n.type === "due" ? (
                          <>
                            Te toca: <span className="font-medium">{n.title || "una tarea"}</span> en «
                            {n.page ? `${n.page.icon ? `${n.page.icon} ` : ""}${n.page.title || "Sin título"}` : "una base borrada"}»
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{n.actor?.name || n.actor?.email || "Alguien"}</span> te mencionó en «
                            {n.page ? `${n.page.icon ? `${n.page.icon} ` : ""}${n.page.title || "Sin título"}` : "una página borrada"}»
                          </>
                        )}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">{when(n.createdAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Galería de plantillas: tarjetas con icono + nombre + descripción; crea la página en el servidor. */
function TemplatesGallery({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const create = trpc.pages.createFromTemplate.useMutation({
    onSuccess: async ({ id }) => {
      await utils.pages.tree.invalidate();
      onClose();
      router.push(`/p/${id}`);
    },
  });
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles size={18} /> Plantillas
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">Empieza con una página o base de datos prehecha.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <button
              key={key}
              disabled={create.isPending}
              onClick={() => create.mutate({ key })}
              className="rounded-lg border border-[var(--border)] p-3 text-left transition-colors hover:border-brand hover:bg-brand-50 disabled:opacity-50"
            >
              <div className="text-2xl">{t.icon}</div>
              <div className="mt-1 text-sm font-medium">{t.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{t.description}</div>
            </button>
          ))}
        </div>
        {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      </div>
    </div>,
    document.body,
  );
}

type Me = {
  id: string;
  email: string;
  name: string | null;
  wsRole: "owner" | "editor" | "viewer" | null;
  workspace: { id: string; name: string; icon: string | null } | null;
} | null | undefined;

function WorkspaceBar({ me }: { me: Me }) {
  const utils = trpc.useUtils();
  const { data: spaces } = trpc.workspace.list.useQuery();
  const [openList, setOpenList] = useState(false);
  const [share, setShare] = useState(false);
  const switchWs = trpc.workspace.switch.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const current = me?.workspace;
  const roleLabel =
    me?.wsRole === "owner" ? "Propietario" : me?.wsRole === "editor" ? "Editor" : me?.wsRole === "viewer" ? "Solo lectura" : "";

  return (
    <div className="relative px-3 pb-2 pt-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpenList((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs text-[var(--muted)] hover:bg-[var(--border)]/40"
          title="Cambiar de espacio"
        >
          <span className="truncate">
            {current?.icon ? `${current.icon} ` : <Folder size={13} className="mr-1 inline align-[-2px]" />}
            {current?.name ?? "Espacio"}
          </span>
          <span className="ml-auto shrink-0"><ChevronDown size={14} /></span>
        </button>
        {me?.wsRole === "owner" && (
          <button
            onClick={() => setShare(true)}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
            title="Compartir este espacio"
          >
            <Users size={14} />
          </button>
        )}
      </div>
      {roleLabel && <div className="px-2 text-[10px] text-[var(--muted)]">{roleLabel}</div>}

      {openList && (
        <div className="absolute left-3 right-3 z-20 mt-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-lg">
          {(spaces ?? []).map((s) => (
            <button
              key={s.id}
              onClick={async () => {
                setOpenList(false);
                if (s.id === current?.id) return;
                await switchWs.mutateAsync({ workspaceId: s.id });
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-brand-50 ${
                s.id === current?.id ? "text-brand" : ""
              }`}
            >
              <span className="truncate">
                {s.icon ? `${s.icon} ` : <Folder size={13} className="mr-1 inline align-[-2px]" />}
                {s.name}
              </span>
              {!s.isOwner && (
                <span className="ml-auto shrink-0 text-[10px] text-[var(--muted)]">de {s.ownerName}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {share && <ShareDialog onClose={() => setShare(false)} onChange={() => utils.workspace.members.invalidate()} />}
    </div>
  );
}

function ShareDialog({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const utils = trpc.useUtils();
  const { data } = trpc.workspace.members.useQuery();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const refresh = async () => {
    await utils.workspace.members.invalidate();
    onChange();
  };
  const share = trpc.workspace.share.useMutation({
    onSuccess: async () => {
      setEmail("");
      setErr(null);
      await refresh();
    },
    onError: (e) => setErr(e.message),
  });
  const setRoleM = trpc.workspace.setRole.useMutation({ onSuccess: refresh });
  const unshare = trpc.workspace.unshare.useMutation({ onSuccess: refresh });

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Users size={18} /> Compartir espacio
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand" title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--muted)]">
          La persona debe haber entrado antes una vez con su cuenta del NAS.
        </p>

        <div className="mb-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && email.trim() && share.mutate({ email: email.trim(), role })}
            placeholder="email de la persona"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-2 text-sm"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Solo lectura</option>
            </select>
            <button
              onClick={() => share.mutate({ email: email.trim(), role })}
              disabled={!email.trim() || share.isPending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>
        {err && <p className="mb-2 text-xs text-red-500">{err}</p>}

        <ul className="mt-3 space-y-1">
          {(data?.members ?? []).map((m) => {
            const isOwner = m.userId === data?.ownerId;
            return (
              <li key={m.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--border)]/30">
                <span className="min-w-0 flex-1 truncate">{m.name || m.email}</span>
                {isOwner ? (
                  <span className="text-xs text-[var(--muted)]">Propietario</span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => setRoleM.mutate({ userId: m.userId, role: e.target.value as "editor" | "viewer" })}
                      className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Solo lectura</option>
                    </select>
                    <button
                      onClick={() => unshare.mutate({ userId: m.userId })}
                      className="rounded px-1 text-xs text-[var(--muted)] hover:text-red-500"
                      title="Quitar acceso"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function AccountFooter({ me }: { me: Me }) {
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/login";
    },
  });
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3">
      <Link
        href="/settings"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-[var(--muted)] hover:text-brand"
        title={me?.email ?? ""}
      >
        <Settings size={14} />
        <span className="truncate">{me?.name || me?.email || "Cuenta"}</span>
      </Link>
      <ThemeToggle />
      <button
        onClick={() => logout.mutate()}
        className="shrink-0 rounded px-2 py-1 text-xs text-[var(--muted)] hover:text-brand"
        title="Cerrar sesión"
      >
        Salir
      </button>
    </div>
  );
}

/** Conmutador de tema claro/oscuro (persistido en localStorage). */
function ThemeToggle() {
  const theme = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="shrink-0 rounded px-1.5 py-1 text-xs text-[var(--muted)] hover:text-brand"
      title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function Tree({
  nodes,
  byParent,
  parentById,
  depth,
  canEdit,
}: {
  nodes: Node[];
  byParent: Map<string | null, Node[]>;
  parentById: Map<string, string | null>;
  depth: number;
  canEdit: boolean;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} byParent={byParent} parentById={parentById} depth={depth} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  byParent,
  parentById,
  depth,
  canEdit,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  parentById: Map<string, string | null>;
  depth: number;
  canEdit: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [dropPos, setDropPos] = useState<"before" | "after" | "inside" | null>(null);
  const children = byParent.get(node.id) ?? [];
  const active = pathname === `/p/${node.id}`;

  const move = trpc.pages.move.useMutation({
    onSuccess: () => utils.pages.tree.invalidate(),
  });

  const addSub = trpc.pages.create.useMutation({
    onSuccess: async (page) => {
      setOpen(true);
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });
  const archive = trpc.pages.archive.useMutation({
    onSuccess: async () => {
      await utils.pages.tree.invalidate();
      if (active) router.push("/");
    },
  });
  const duplicate = trpc.pages.duplicate.useMutation({
    onSuccess: async (res) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${res.id}`);
    },
  });

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${
          active ? "bg-brand-50 text-brand" : "hover:bg-[var(--border)]/40"
        } ${
          dropPos === "inside"
            ? "bg-brand-50 ring-1 ring-brand"
            : dropPos === "before"
              ? "shadow-[inset_0_2px_0_0_var(--color-brand)]"
              : dropPos === "after"
                ? "shadow-[inset_0_-2px_0_0_var(--color-brand)]"
                : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        draggable={canEdit}
        onDragStart={(e) => {
          draggedId = node.id;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          draggedId = null;
        }}
        onDragOver={(e) => {
          if (!canEdit || !draggedId || isInSubtree(node.id, draggedId, parentById)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - r.top;
          setDropPos(y < r.height / 4 ? "before" : y > (r.height * 3) / 4 ? "after" : "inside");
        }}
        onDragLeave={() => setDropPos(null)}
        onDrop={(e) => {
          e.preventDefault();
          const pos = dropPos;
          setDropPos(null);
          if (!pos || !draggedId || isInSubtree(node.id, draggedId, parentById)) return;
          if (pos === "inside") {
            move.mutate({ id: draggedId, parentId: node.id });
            setOpen(true);
          } else if (pos === "before") {
            move.mutate({ id: draggedId, parentId: node.parentId, beforeId: node.id });
          } else {
            move.mutate({ id: draggedId, parentId: node.parentId, afterId: node.id });
          }
          draggedId = null;
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex w-4 shrink-0 items-center justify-center text-[var(--muted)] ${node.hasChildren ? "" : "invisible"}`}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <Link href={`/p/${node.id}`} className="flex-1 truncate py-1" draggable={false}>
          {node.icon ? `${node.icon} ` : <FileText size={13} className="mr-1 inline align-[-2px]" />}
          {node.title || "Sin título"}
        </Link>
        {canEdit && (
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => addSub.mutate({ parentId: node.id })}
              className="rounded px-1 text-[var(--muted)] hover:text-brand"
              title="Añadir subpágina"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ x: r.left, y: r.bottom });
              }}
              className="rounded px-1 text-[var(--muted)] hover:text-brand"
              title="Más acciones"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
      </div>

      {menu && (
        <RowMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              icon: <Plus size={16} />,
              label: "Añadir subpágina",
              onClick: () => addSub.mutate({ parentId: node.id }),
            },
            {
              icon: <Copy size={16} />,
              label: "Duplicar",
              onClick: () => duplicate.mutate({ id: node.id }),
            },
            {
              icon: <FolderInput size={16} />,
              label: "Mover a…",
              onClick: () => setMoving(true),
            },
            {
              icon: <Trash2 size={16} />,
              label: "Enviar a la papelera",
              danger: true,
              onClick: () => archive.mutate({ id: node.id }),
            },
          ]}
        />
      )}

      {moving && <MovePageModal pageId={node.id} onClose={() => setMoving(false)} />}

      {open && children.length > 0 && (
        <Tree nodes={children} byParent={byParent} parentById={parentById} depth={depth + 1} canEdit={canEdit} />
      )}
    </li>
  );
}

function RowMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: { icon?: React.ReactNode; label: string; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] min-w-44 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1 shadow-xl"
      style={{ left: x, top: y + 4 }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-[var(--border)]/40 ${
            it.danger ? "text-red-500" : ""
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
