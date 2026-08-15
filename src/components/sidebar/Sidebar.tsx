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
  const { data: pages } = trpc.pages.tree.useQuery();
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
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/" className="font-display text-lg font-bold">
          Note<span className="text-brand">ly</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
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
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <Tree nodes={byParent.get(null) ?? []} byParent={byParent} depth={0} />
      </nav>
      <Link
        href="/trash"
        className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)] hover:text-brand"
      >
        🗑 Papelera
      </Link>
    </aside>
  );
}

function Tree({
  nodes,
  byParent,
  depth,
}: {
  nodes: Node[];
  byParent: Map<string | null, Node[]>;
  depth: number;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <TreeItem key={n.id} node={n} byParent={byParent} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  byParent,
  depth,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  depth: number;
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
      </div>
      {open && children.length > 0 && (
        <Tree nodes={children} byParent={byParent} depth={depth + 1} />
      )}
    </li>
  );
}
