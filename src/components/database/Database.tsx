"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";
import { TableView } from "./TableView";
import { KanbanView } from "./KanbanView";
import { ChartView } from "./ChartView";

export function Database({ pageId, title }: { pageId: string; title: string }) {
  const { data: col, isLoading } = trpc.db.get.useQuery({ pageId });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  if (isLoading || !col) {
    return <div className="px-10 py-10 text-[var(--muted)]">Cargando base de datos…</div>;
  }

  const active = col.views.find((v) => v.id === activeViewId) ?? col.views[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records = col.records as any;
  const fields = col.fields;

  return (
    <div className="px-3 py-5 md:px-8">
      <h1 className="font-display mb-4 text-2xl font-extrabold md:text-3xl">🗃️ {title}</h1>
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
            {v.type === "kanban" ? "▦ " : "▤ "}
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
