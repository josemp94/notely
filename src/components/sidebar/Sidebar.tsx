"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/trpc/react";

type Node = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  order: string;
  hasChildren: boolean;
};

export function Sidebar() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: pages } = trpc.pages.tree.useQuery();
  const canEdit = me?.wsRole !== "viewer";

  const create = trpc.pages.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });
  const createDb = trpc.db.create.useMutation({
    onSuccess: async (page) => {
      await utils.pages.tree.invalidate();
      router.push(`/p/${page.id}`);
    },
  });

  const byParent = new Map<string | null, Node[]>();
  for (const p of pages ?? []) {
    const arr = byParent.get(p.parentId) ?? [];
    arr.push(p);
    byParent.set(p.parentId, arr);
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
                + Página
              </button>
              <button
                onClick={() => createDb.mutate({ parentId: null })}
                className="rounded-md px-2 py-1 text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
                title="Nueva base de datos"
              >
                + BD
              </button>
            </>
          )}
        </div>
      </div>

      <WorkspaceBar me={me} />

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <Tree nodes={byParent.get(null) ?? []} byParent={byParent} depth={0} canEdit={canEdit} />
      </nav>
      <Link
        href="/trash"
        className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] hover:text-brand"
      >
        🗑 Papelera
      </Link>
      <AccountFooter me={me} />
    </aside>
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
            {current?.icon ? `${current.icon} ` : "🗂 "}
            {current?.name ?? "Espacio"}
          </span>
          <span className="ml-auto shrink-0">▾</span>
        </button>
        {me?.wsRole === "owner" && (
          <button
            onClick={() => setShare(true)}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-brand-50 hover:text-brand"
            title="Compartir este espacio"
          >
            👥
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
                {s.icon ? `${s.icon} ` : "🗂 "}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Compartir espacio</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-brand">
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email de la persona (cuenta del NAS)"
            className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
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
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Añadir
          </button>
        </div>
        {err && <p className="mb-3 text-xs text-red-500">{err}</p>}

        <ul className="space-y-1">
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
                      ✕
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
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
      <Link href="/settings" className="min-w-0 flex-1 truncate text-xs text-[var(--muted)] hover:text-brand" title={me?.email ?? ""}>
        ⚙ {me?.name || me?.email || "Cuenta"}
      </Link>
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

function Tree({
  nodes,
  byParent,
  depth,
  canEdit,
}: {
  nodes: Node[];
  byParent: Map<string | null, Node[]>;
  depth: number;
  canEdit: boolean;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} byParent={byParent} depth={depth} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  byParent,
  depth,
  canEdit,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  depth: number;
  canEdit: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(true);
  const children = byParent.get(node.id) ?? [];
  const active = pathname === `/p/${node.id}`;

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

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${
          active ? "bg-brand-50 text-brand" : "hover:bg-[var(--border)]/40"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={`w-4 shrink-0 text-[var(--muted)] ${node.hasChildren ? "" : "invisible"}`}
        >
          {open ? "▾" : "▸"}
        </button>
        <Link href={`/p/${node.id}`} className="flex-1 truncate py-1">
          {node.icon ? `${node.icon} ` : "📄 "}
          {node.title || "Sin título"}
        </Link>
        {canEdit && (
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => addSub.mutate({ parentId: node.id })}
              className="rounded px-1 text-[var(--muted)] hover:text-brand"
              title="Añadir subpágina"
            >
              +
            </button>
            <button
              onClick={() => archive.mutate({ id: node.id })}
              className="rounded px-1 text-[var(--muted)] hover:text-brand"
              title="Enviar a la papelera"
            >
              ⋯
            </button>
          </div>
        )}
      </div>
      {open && children.length > 0 && (
        <Tree nodes={children} byParent={byParent} depth={depth + 1} canEdit={canEdit} />
      )}
    </li>
  );
}
