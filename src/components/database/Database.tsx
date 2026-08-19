"use client";

import { useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { trpc } from "@/trpc/react";
import { PageIcon } from "@/components/PageIcon";
import { AddCoverButton, CoverBand } from "@/components/PageCover";
import { applyViewConfig, type DbField, type DbRecord } from "@/lib/viewData";
import { usePeople } from "./Cell";
import { displayValue } from "@/lib/cellText";
import { DbToolbar, ViewIcon } from "./DbToolbar";
import { TableView } from "./TableView";
import { KanbanView } from "./KanbanView";
import { ChartView } from "./ChartView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { TimelineView } from "./TimelineView";
import { FormView } from "./FormView";

export function Database({
  pageId,
  initialTitle,
  initialIcon,
  initialCover,
  canEdit = true,
  embedded = false,
}: {
  pageId: string;
  initialTitle: string;
  initialIcon?: string | null;
  initialCover?: string | null;
  canEdit?: boolean;
  /** BD embebida en el cuerpo de otra página: sin cabecera (título/icono/portada) y con padding compacto. */
  embedded?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: col, isLoading } = trpc.db.get.useQuery({ pageId });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? "🗃️");
  const [cover, setCover] = useState<string | null>(initialCover ?? null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const people = usePeople();

  const rename = trpc.pages.rename.useMutation({ onSuccess: () => utils.pages.tree.invalidate() });
  const setCoverM = trpc.pages.setCover.useMutation();

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
  function onCoverChange(next: string | null) {
    setCover(next);
    setCoverM.mutate({ id: pageId, cover: next });
  }

  const active = col?.views.find((v) => v.id === activeViewId) ?? col?.views[0];
  const fields = col?.fields ?? [];
  const rawRecords = col?.records ?? [];
  const viewRecords = useMemo(
    () => applyViewConfig(rawRecords as unknown as DbRecord[], fields as unknown as DbField[], active?.config),
    [rawRecords, fields, active],
  );
  // Búsqueda interna (la lupa): sobre el texto visible de cada celda, después de filtros y orden.
  const shownRecords = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return viewRecords;
    return viewRecords.filter((r) =>
      (fields as unknown as DbField[]).some((f) =>
        displayValue(f, r.cells?.[f.id], people).toLowerCase().includes(needle),
      ),
    );
  }, [viewRecords, fields, q, people]);

  if (isLoading || !col) {
    return <div className="px-4 py-6 text-[var(--muted)]">Cargando base de datos…</div>;
  }
  if (!active) {
    return <div className="px-4 py-6 text-[var(--muted)]">Esta base de datos no tiene vistas.</div>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asAny = (r: unknown) => r as any;
  const hiddenIds: string[] = asAny(active.config)?.hiddenFields ?? [];
  const visibleFields = fields.filter((f) => !hiddenIds.includes(asAny(f).id));

  return (
    <div>
      {!embedded && cover && <CoverBand cover={cover} onChange={onCoverChange} editable={canEdit} />}
      <div className={embedded ? "px-3 pb-3" : `px-3 pb-5 md:px-8 ${cover ? "" : "pt-5"}`}>
      {!embedded && (
      <div className="group/header mb-4">
        {canEdit && !cover && (
          <div className="h-7">
            <AddCoverButton onChange={onCoverChange} />
          </div>
        )}
        <div className={`mb-1 flex items-center gap-3 ${cover ? "relative z-10 -mt-10" : ""}`}>
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
      )}

      <div className="mb-4 flex items-end justify-between gap-2 border-b border-[var(--border)]">
        <div className="flex gap-1 overflow-x-auto">
          {col.views.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveViewId(v.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm ${
                active?.id === v.id
                  ? "border-b-2 border-brand font-medium text-brand"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <ViewIcon type={v.type} />
              {v.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 pb-1">
          {searchOpen ? (
            <div className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1">
              <Search size={13} className="shrink-0 text-[var(--muted)]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setQ(""), setSearchOpen(false))}
                placeholder="Buscar en la base de datos…"
                className="w-44 bg-transparent text-xs outline-none"
              />
              <button
                onClick={() => { setQ(""); setSearchOpen(false); }}
                className="shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
                title="Cerrar búsqueda"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--border)]/40"
              title="Buscar en la base de datos"
            >
              <Search size={15} />
            </button>
          )}
        {canEdit && active && (
          <div>
            <DbToolbar
              pageId={pageId}
              collectionId={col.id}
              view={active}
              fields={fields}
              onViewCreated={(id) => setActiveViewId(id)}
              onViewDeleted={() => setActiveViewId(null)}
            />
          </div>
        )}
        </div>
      </div>

      {active?.type === "kanban" ? (
        <KanbanView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          groupByFieldId={asAny(active.config)?.groupByFieldId}
          cardSize={asAny(active.config)?.cardSize}
          cardPreview={asAny(active.config)?.cardPreview}
        />
      ) : active?.type === "chart" ? (
        <ChartView pageId={pageId} view={active} fields={fields} />
      ) : active?.type === "calendar" ? (
        <CalendarView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          view={active}
        />
      ) : active?.type === "timeline" ? (
        <TimelineView pageId={pageId} collectionId={col.id} fields={asAny(visibleFields)} records={asAny(shownRecords)} view={active} />
      ) : active?.type === "gallery" ? (
        <GalleryView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          cardSize={asAny(active.config)?.cardSize}
          cardPreview={asAny(active.config)?.cardPreview}
          colorFieldId={asAny(active.config)?.rowColorFieldId}
        />
      ) : active?.type === "list" ? (
        <ListView pageId={pageId} collectionId={col.id} fields={asAny(visibleFields)} records={asAny(shownRecords)} />
      ) : active?.type === "form" ? (
        <FormView pageId={pageId} collectionId={col.id} fields={asAny(fields)} />
      ) : (
        <TableView
          pageId={pageId}
          collectionId={col.id}
          fields={asAny(visibleFields)}
          records={asAny(shownRecords)}
          view={active}
          templates={asAny(col).templates ?? []}
        />
      )}
      </div>
    </div>
  );
}
