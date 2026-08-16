"use client";

import { useRef, useState } from "react";
import { trpc } from "@/trpc/react";
import { PageIcon } from "@/components/PageIcon";
import { TableView } from "./TableView";
import { KanbanView } from "./KanbanView";
import { ChartView } from "./ChartView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";

export function Database({
  pageId,
  initialTitle,
  initialIcon,
  canEdit = true,
}: {
  pageId: string;
  initialTitle: string;
  initialIcon?: string | null;
  canEdit?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: col, isLoading } = trpc.db.get.useQuery({ pageId });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? "🗃️");
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rename = trpc.pages.rename.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });

  function persist(nextTitle: string, nextIcon: string | null) {
    rename.mutate({ id: pageId, title: nextTitle, icon: nextIcon });
  }
  function onTitleChange(v: string) {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => persist(v, icon), 600);
  }
  function onIconChange(next: string | null) {
    setIcon(next);
    persist(title, next);
  }

  if (isLoading || !col) {
    return <div className="px-10 py-10 text-[var(--muted)]">Cargando base de datos…</div>;
  }

  const active = col.views.find((v) => v.id === activeViewId) ?? col.views[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records = col.records as any;
  const fields = col.fields;

  return (
    <div className="px-3 py-5 md:px-8">
      <div className="group/header mb-4">
        <div className="mb-1 flex items-center gap-3">
          <PageIcon icon={icon} onChange={onIconChange} editable={canEdit} />
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Sin título"
            readOnly={!canEdit}
            className="font-display w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-[var(--border)] md:text-3xl"
          />
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-[var(--border)]">
        {col.views.map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveViewId(v.id)}
            className={`px-3 py-1.5 text-sm ${
              active?.id === v.id
                ? "border-b-2 border-brand font-medium text-brand"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {v.type === "kanban" ? "▦ " : v.type === "chart" ? "▧ " : v.type === "calendar" ? "🗓 " : v.type === "gallery" ? "🖼 " : "▤ "}
            {v.name}
          </button>
        ))}
      </div>

      {active?.type === "kanban" ? (
        <KanbanView
          pageId={pageId}
          collectionId={col.id}
          fields={fields}
          records={records}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          groupByFieldId={(active.config as any)?.groupByFieldId}
        />
      ) : active?.type === "chart" ? (
        <ChartView pageId={pageId} view={active} fields={fields} />
      ) : active?.type === "calendar" ? (
        <CalendarView
          pageId={pageId}
          collectionId={col.id}
          fields={fields}
          records={records}
          view={active}
        />
      ) : active?.type === "gallery" ? (
        <GalleryView
          pageId={pageId}
          collectionId={col.id}
          fields={fields}
          records={records}
        />
      ) : (
        <TableView
          pageId={pageId}
          collectionId={col.id}
          fields={fields}
          records={records}
          view={active}
        />
      )}
    </div>
  );
}
