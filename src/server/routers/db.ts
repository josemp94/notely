import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, workspaceProcedure } from "../trpc";
import { rankAtEnd } from "@/lib/fractional";
import { evalFormula } from "../formula";

// Tipos de campo soportados en Fase 2
export const FIELD_TYPES = ["text", "number", "select", "checkbox", "date", "url", "email", "phone"] as const;

async function assertPage(ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } }, pageId: string) {
  const p = await ctx.db.page.findFirst({
    where: { id: pageId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
}

async function assertCollection(
  ctx: { db: typeof import("@/lib/db").db; workspace: { id: string } },
  collectionId: string,
) {
  const c = await ctx.db.collection.findFirst({
    where: { id: collectionId, page: { workspaceId: ctx.workspace.id } },
    select: { id: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
  return c;
}

export const dbRouter = router({
  /** Crea una página de tipo base de datos, con colección, campos, vistas y filas de ejemplo. */
  create: workspaceProcedure
    .input(z.object({ parentId: z.string().nullish(), title: z.string().default("Base de datos") }))
    .mutation(async ({ ctx, input }) => {
      const last = await ctx.db.page.findFirst({
        where: { workspaceId: ctx.workspace.id, parentId: input.parentId ?? null },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const page = await ctx.db.page.create({
        data: {
          workspaceId: ctx.workspace.id,
          parentId: input.parentId ?? null,
          title: input.title,
          icon: "🗃️",
          type: "database",
          order: rankAtEnd(last?.order ?? null),
          content: [],
        },
      });
      const collection = await ctx.db.collection.create({
        data: { pageId: page.id, name: input.title },
      });
      // Campo único inicial: "Nombre" (como Notion). El resto se añaden con "+".
      await ctx.db.field.create({
        data: { collectionId: collection.id, name: "Nombre", type: "text", order: rankAtEnd(null), config: {} },
      });
      // Vista inicial: solo Tabla. El resto se añaden con "+ Vista".
      await ctx.db.view.create({
        data: { collectionId: collection.id, name: "Tabla", type: "table", config: {} },
      });
      // Filas vacías iniciales (como Notion).
      let ord: string | null = null;
      for (let i = 0; i < 3; i++) {
        ord = rankAtEnd(ord);
        await ctx.db.record.create({
          data: { collectionId: collection.id, order: ord, cells: {} },
        });
      }
      return page;
    }),

  /** Devuelve todo lo necesario para renderizar la base de datos de una página. */
  get: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const collection = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: {
          fields: { orderBy: { order: "asc" } },
          views: { orderBy: { id: "asc" } },
          records: { orderBy: { order: "asc" } },
        },
      });
      if (!collection) throw new TRPCError({ code: "NOT_FOUND" });
      return collection;
    }),

  addField: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Campo"), type: z.enum(FIELD_TYPES) }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: input.type,
          order: rankAtEnd(last?.order ?? null),
          config: input.type === "select" ? { options: [] } : {},
        },
      });
    }),

  updateField: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), config: z.any().optional() }))
    .mutation(async ({ ctx, input }) => {
      const f = await ctx.db.field.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!f) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.field.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.config !== undefined ? { config: input.config } : {}),
        },
      });
    }),

  deleteField: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const f = await ctx.db.field.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!f) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.field.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addRecord: workspaceProcedure
    .input(z.object({ collectionId: z.string(), cells: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.record.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.record.create({
        data: {
          collectionId: input.collectionId,
          order: rankAtEnd(last?.order ?? null),
          cells: input.cells ?? {},
        },
      });
    }),

  updateCell: workspaceProcedure
    .input(z.object({ recordId: z.string(), fieldId: z.string(), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.recordId, collection: { page: { workspaceId: ctx.workspace.id } } },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      const cells = { ...(rec.cells as Record<string, unknown>), [input.fieldId]: input.value };
      if (input.value === null || input.value === "") delete cells[input.fieldId];
      return ctx.db.record.update({
        where: { id: input.recordId },
        data: { cells: cells as Prisma.InputJsonValue },
        select: { id: true, cells: true },
      });
    }),

  deleteRecord: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.record.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.record.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  updateView: workspaceProcedure
    .input(z.object({ id: z.string(), config: z.any() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.view.update({ where: { id: input.id }, data: { config: input.config } });
    }),

  /** Crear una vista nueva en la colección. */
  addView: workspaceProcedure
    .input(z.object({ collectionId: z.string(), type: z.enum(["table", "kanban", "calendar", "gallery", "chart", "list", "form"]), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const fields = await ctx.db.field.findMany({
        where: { collectionId: input.collectionId },
        orderBy: { order: "asc" },
      });
      const firstOf = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
      const names: Record<string, string> = { table: "Tabla", kanban: "Kanban", calendar: "Calendario", gallery: "Galería", chart: "Gráfica", list: "Lista", form: "Formulario" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = {};
      if (input.type === "kanban") config = { groupByFieldId: firstOf("select") };
      else if (input.type === "calendar") config = { dateFieldId: firstOf("date") };
      else if (input.type === "chart") config = { chartType: "bar", xFieldId: firstOf("select"), yFieldId: null, agg: "count" };
      return ctx.db.view.create({
        data: { collectionId: input.collectionId, name: input.name?.trim() || names[input.type], type: input.type, config },
      });
    }),

  /** Renombrar una vista. */
  renameView: workspaceProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.view.update({ where: { id: input.id }, data: { name: input.name.trim() } });
    }),

  /** Borrar una vista (no la última). */
  deleteView: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const count = await ctx.db.view.count({ where: { collectionId: v.collectionId } });
      if (count <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes borrar la última vista." });
      await ctx.db.view.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Cambiar el tipo de una vista ("Mostrar como"), recalculando su config por defecto. */
  setViewType: workspaceProcedure
    .input(z.object({ id: z.string(), type: z.enum(["table", "kanban", "calendar", "gallery", "chart", "list", "form"]) }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.view.findFirst({
        where: { id: input.id, collection: { page: { workspaceId: ctx.workspace.id } } },
        select: { id: true, collectionId: true, config: true },
      });
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      const fields = await ctx.db.field.findMany({
        where: { collectionId: v.collectionId },
        orderBy: { order: "asc" },
      });
      const firstOf = (t: string) => fields.find((f) => f.type === t)?.id ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (v.config as any) ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = { filters: prev.filters, sorts: prev.sorts };
      if (input.type === "kanban") config.groupByFieldId = prev.groupByFieldId ?? firstOf("select");
      else if (input.type === "calendar") config.dateFieldId = prev.dateFieldId ?? firstOf("date");
      else if (input.type === "chart")
        config = { ...config, chartType: prev.chartType ?? "bar", xFieldId: prev.xFieldId ?? firstOf("select"), yFieldId: prev.yFieldId ?? null, agg: prev.agg ?? "count" };
      return ctx.db.view.update({ where: { id: input.id }, data: { type: input.type, config } });
    }),

  /** Lista todas las bases de datos del workspace (para elegir destino de una relación). */
  listDatabases: workspaceProcedure.query(async ({ ctx }) => {
    const cols = await ctx.db.collection.findMany({
      where: { page: { workspaceId: ctx.workspace.id, type: "database", archivedAt: null } },
      select: {
        id: true,
        page: { select: { id: true, title: true, icon: true } },
        fields: { orderBy: { order: "asc" }, select: { id: true, name: true, type: true } },
      },
    });
    return cols.map((c) => ({
      collectionId: c.id,
      pageId: c.page.id,
      title: c.page.title,
      icon: c.page.icon,
      fields: c.fields,
    }));
  }),

  /** Registros de una colección como opciones {id,title} para el selector de relación. */
  relationOptions: workspaceProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const col = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        include: { fields: { orderBy: { order: "asc" } }, records: { orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const titleField = col.fields.find((f) => f.type === "text") ?? col.fields[0];
      return col.records.map((r) => {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        const t = titleField ? cells[titleField.id] : "";
        return { id: r.id, title: (typeof t === "string" && t) || "Sin título" };
      });
    }),

  /** Crea un campo de relación que apunta a otra base de datos. */
  addRelation: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Relación"), targetCollectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const target = await assertCollection(ctx, input.targetCollectionId);
      const tPage = await ctx.db.collection.findUnique({
        where: { id: input.targetCollectionId },
        select: { pageId: true },
      });
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "relation",
          order: rankAtEnd(last?.order ?? null),
          config: { targetCollectionId: target.id, targetPageId: tPage?.pageId ?? null },
        },
      });
    }),

  /** Crea un campo rollup que agrega valores de los registros relacionados. */
  addRollup: workspaceProcedure
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().default("Rollup"),
        relationFieldId: z.string(),
        targetFieldId: z.string().nullish(),
        agg: z.enum(["count", "sum", "avg", "min", "max", "values"]).default("count"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "rollup",
          order: rankAtEnd(last?.order ?? null),
          config: {
            relationFieldId: input.relationFieldId,
            targetFieldId: input.targetFieldId ?? null,
            agg: input.agg,
          },
        },
      });
    }),

  /** Crea un campo de fórmula (expresión calculada estilo Notion). */
  addFormula: workspaceProcedure
    .input(z.object({ collectionId: z.string(), name: z.string().default("Fórmula"), expression: z.string().default("") }))
    .mutation(async ({ ctx, input }) => {
      await assertCollection(ctx, input.collectionId);
      const last = await ctx.db.field.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      return ctx.db.field.create({
        data: {
          collectionId: input.collectionId,
          name: input.name,
          type: "formula",
          order: rankAtEnd(last?.order ?? null),
          config: { expression: input.expression },
        },
      });
    }),

  /** Resuelve etiquetas de relaciones, valores de rollups y fórmulas (se calcula en el servidor). */
  computed: workspaceProcedure
    .input(z.object({ pageId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: { orderBy: { order: "asc" } } },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });

      const relationFields = col.fields.filter((f) => f.type === "relation");
      const rollupFields = col.fields.filter((f) => f.type === "rollup");
      const formulaFields = col.fields.filter((f) => f.type === "formula");

      // Valor escalar de un campo para el contexto de fórmulas.
      const scalarOf = (field: (typeof col.fields)[number], cellVal: unknown): number | string | boolean | null => {
        if (cellVal === undefined || cellVal === null || cellVal === "") return null;
        if (field.type === "select") {
          const opts = ((field.config as { options?: { id: string; label: string }[] }).options) ?? [];
          return opts.find((o) => o.id === cellVal)?.label ?? String(cellVal);
        }
        if (field.type === "checkbox") return Boolean(cellVal);
        if (field.type === "number") return Number(cellVal);
        if (field.type === "relation") return Array.isArray(cellVal) ? cellVal.length : 0;
        return typeof cellVal === "string" ? cellVal : String(cellVal);
      };

      // Cargar las colecciones destino referenciadas por las relaciones.
      const targetColIds = [
        ...new Set(
          relationFields
            .map((f) => (f.config as { targetCollectionId?: string })?.targetCollectionId)
            .filter((x): x is string => !!x),
        ),
      ];
      const targetCols = await ctx.db.collection.findMany({
        where: { id: { in: targetColIds }, page: { workspaceId: ctx.workspace.id } },
        include: { fields: { orderBy: { order: "asc" } }, records: true },
      });
      // Índice: colección destino -> (recordId -> {title, cells}), y su titleFieldId.
      const targetIndex = new Map<
        string,
        { titleFieldId: string | null; recs: Map<string, Record<string, unknown>>; titles: Map<string, string> }
      >();
      for (const tc of targetCols) {
        const titleField = tc.fields.find((f) => f.type === "text") ?? tc.fields[0];
        const recs = new Map<string, Record<string, unknown>>();
        const titles = new Map<string, string>();
        for (const r of tc.records) {
          const cells = (r.cells ?? {}) as Record<string, unknown>;
          recs.set(r.id, cells);
          const t = titleField ? cells[titleField.id] : "";
          titles.set(r.id, (typeof t === "string" && t) || "Sin título");
        }
        targetIndex.set(tc.id, { titleFieldId: titleField?.id ?? null, recs, titles });
      }

      const relIdsOf = (cells: Record<string, unknown>, fieldId: string): string[] => {
        const v = cells[fieldId];
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      };

      const relationLabels: Record<string, Record<string, { id: string; title: string }[]>> = {};
      const rollups: Record<string, Record<string, string | number>> = {};

      for (const rec of col.records) {
        const cells = (rec.cells ?? {}) as Record<string, unknown>;
        // etiquetas de relación
        for (const rf of relationFields) {
          const tcid = (rf.config as { targetCollectionId?: string })?.targetCollectionId;
          const idx = tcid ? targetIndex.get(tcid) : undefined;
          const ids = relIdsOf(cells, rf.id);
          const labels = ids.map((id) => ({ id, title: idx?.titles.get(id) ?? "—" }));
          (relationLabels[rec.id] ??= {})[rf.id] = labels;
        }
        // rollups
        for (const rup of rollupFields) {
          const cfg = (rup.config ?? {}) as { relationFieldId?: string; targetFieldId?: string | null; agg?: string };
          const relField = relationFields.find((f) => f.id === cfg.relationFieldId);
          const tcid = relField ? (relField.config as { targetCollectionId?: string })?.targetCollectionId : undefined;
          const idx = tcid ? targetIndex.get(tcid) : undefined;
          const ids = relField ? relIdsOf(cells, relField.id) : [];
          const agg = cfg.agg ?? "count";
          let out: string | number = 0;
          if (agg === "count") {
            out = ids.length;
          } else if (cfg.targetFieldId && idx) {
            const tf = targetCols.find((t) => t.id === tcid)?.fields.find((f) => f.id === cfg.targetFieldId);
            const raw = ids.map((id) => idx.recs.get(id)?.[cfg.targetFieldId!]).filter((v) => v !== undefined && v !== null && v !== "");
            if (agg === "values") {
              const toLabel = (v: unknown) => {
                if (tf?.type === "select") {
                  const opts = ((tf.config as { options?: { id: string; label: string }[] }).options) ?? [];
                  return opts.find((o) => o.id === v)?.label ?? String(v);
                }
                return String(v);
              };
              out = raw.map(toLabel).join(", ");
            } else {
              const nums = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
              if (nums.length === 0) out = 0;
              else if (agg === "sum") out = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
              else if (agg === "avg") out = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
              else if (agg === "min") out = Math.min(...nums);
              else if (agg === "max") out = Math.max(...nums);
            }
          }
          (rollups[rec.id] ??= {})[rup.id] = out;
        }
        // fórmulas (pueden referenciar otros campos y rollups por nombre)
        if (formulaFields.length) {
          const cellsRec = (rec.cells ?? {}) as Record<string, unknown>;
          const ctxByName: Record<string, number | string | boolean | null> = {};
          for (const f of col.fields) {
            if (f.type === "rollup") ctxByName[f.name] = rollups[rec.id]?.[f.id] ?? null;
            else if (f.type !== "formula") ctxByName[f.name] = scalarOf(f, cellsRec[f.id]);
          }
          for (const ff of formulaFields) {
            const expr = (ff.config as { expression?: string })?.expression ?? "";
            const v = evalFormula(expr, ctxByName);
            (rollups[rec.id] ??= {})[ff.id] = v === null ? "" : (v as string | number);
          }
        }
      }

      return { relationLabels, rollups };
    }),

  /** Datos agregados para una vista de gráfica (se calcula en el servidor). */
  chartData: workspaceProcedure
    .input(z.object({ pageId: z.string(), viewId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertPage(ctx, input.pageId);
      const col = await ctx.db.collection.findUnique({
        where: { pageId: input.pageId },
        include: { fields: true, records: true, views: true },
      });
      if (!col) throw new TRPCError({ code: "NOT_FOUND" });
      const view = col.views.find((v) => v.id === input.viewId);
      const cfg = (view?.config ?? {}) as {
        chartType?: string;
        xFieldId?: string;
        yFieldId?: string | null;
        agg?: string;
      };
      const xField = col.fields.find((f) => f.id === cfg.xFieldId);
      const yField = cfg.yFieldId ? col.fields.find((f) => f.id === cfg.yFieldId) : null;
      const agg = cfg.agg ?? "count";

      // Etiqueta del valor del eje X según el tipo de campo.
      const xLabel = (val: unknown): string => {
        if (val === null || val === undefined || val === "") return "Sin valor";
        if (xField?.type === "select") {
          const opts = ((xField.config as { options?: { id: string; label: string }[] }).options) ?? [];
          return opts.find((o) => o.id === val)?.label ?? String(val);
        }
        if (xField?.type === "date") return String(val).slice(0, 7); // agrupa por mes YYYY-MM
        if (xField?.type === "checkbox") return val ? "Sí" : "No";
        return String(val);
      };

      const groups = new Map<string, number[]>();
      for (const r of col.records) {
        const cells = (r.cells ?? {}) as Record<string, unknown>;
        const label = xLabel(xField ? cells[xField.id] : undefined);
        let y = 1;
        if (yField) {
          const n = Number(cells[yField.id]);
          y = Number.isFinite(n) ? n : 0;
        }
        const arr = groups.get(label) ?? [];
        arr.push(y);
        groups.set(label, arr);
      }

      const categories = [...groups.keys()].sort();
      const values = categories.map((c) => {
        const arr = groups.get(c)!;
        if (agg === "count") return arr.length;
        const sum = arr.reduce((a, b) => a + b, 0);
        if (agg === "avg") return arr.length ? Math.round((sum / arr.length) * 100) / 100 : 0;
        return Math.round(sum * 100) / 100; // sum
      });

      return {
        chartType: cfg.chartType ?? "bar",
        categories,
        values,
        xName: xField?.name ?? "",
        yName: agg === "count" ? "Registros" : yField?.name ?? "",
      };
    }),
});
