"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { trpc } from "@/trpc/react";
import type { FieldLite } from "@/lib/cellText";

const BRAND = "#ff5c28";
const PALETTE = ["#ff5c28", "#2d9d78", "#4a5568", "#e2b93b", "#9f7aea", "#38b2ac", "#ed64a6"];

type ChartConfig = {
  chartType?: string;
  xFieldId?: string;
  yFieldId?: string | null;
  agg?: string;
  dateBucket?: string;
};

const DATE_TYPES = ["date", "created_time", "last_edited_time"];

export function ChartView({
  pageId,
  view,
  fields,
}: {
  pageId: string;
  view: { id: string; config: unknown };
  fields: FieldLite[];
}) {
  const utils = trpc.useUtils();
  const cfg = (view.config ?? {}) as ChartConfig;
  const { data } = trpc.db.chartData.useQuery({ pageId, viewId: view.id });
  const updateView = trpc.db.updateView.useMutation({
    onSuccess: async () => {
      await utils.db.get.invalidate({ pageId });
      await utils.db.chartData.invalidate({ pageId, viewId: view.id });
    },
  });

  const save = (patch: Partial<ChartConfig>) =>
    updateView.mutate({ id: view.id, config: { ...cfg, ...patch } });

  const numberFields = fields.filter((f) => f.type === "number");

  const option = useMemo(() => {
    if (!data) return {};
    const { chartType, categories, values, xName, yName } = data;
    if (chartType === "pie" || chartType === "donut") {
      return {
        color: PALETTE,
        tooltip: { trigger: "item" },
        legend: { bottom: 0, type: "scroll" },
        series: [
          {
            type: "pie",
            radius: chartType === "donut" ? ["40%", "70%"] : "65%",
            data: categories.map((c, i) => ({ name: c, value: values[i] })),
          },
        ],
      };
    }
    return {
      color: [BRAND],
      grid: { left: 48, right: 20, top: 24, bottom: 48 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: categories, name: xName, axisLabel: { rotate: categories.length > 6 ? 30 : 0 } },
      yAxis: { type: "value", name: yName },
      series: [{ type: chartType === "line" ? "line" : "bar", data: values, smooth: true, areaStyle: chartType === "line" ? {} : undefined }],
    };
  }, [data]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Select
          label="Tipo"
          value={cfg.chartType ?? "bar"}
          onChange={(v) => save({ chartType: v })}
          options={[
            ["bar", "Barras"],
            ["line", "Líneas"],
            ["pie", "Tarta"],
            ["donut", "Donut"],
          ]}
        />
        <Select
          label="Agrupar por"
          value={cfg.xFieldId ?? ""}
          onChange={(v) => save({ xFieldId: v })}
          options={fields.map((f) => [f.id, f.name] as [string, string])}
        />
        {DATE_TYPES.includes(fields.find((f) => f.id === cfg.xFieldId)?.type ?? "") && (
          <Select
            label="Por"
            value={cfg.dateBucket ?? "month"}
            onChange={(v) => save({ dateBucket: v })}
            options={[
              ["day", "Día"],
              ["week", "Semana"],
              ["month", "Mes"],
              ["quarter", "Trimestre"],
              ["year", "Año"],
            ]}
          />
        )}
        <Select
          label="Medida"
          value={cfg.agg ?? "count"}
          onChange={(v) => save({ agg: v })}
          options={[
            ["count", "Contar"],
            ["sum", "Sumar"],
            ["avg", "Media"],
            ["min", "Mínimo"],
            ["max", "Máximo"],
            ["median", "Mediana"],
          ]}
        />
        {cfg.agg !== "count" && (
          <Select
            label="Campo"
            value={cfg.yFieldId ?? ""}
            onChange={(v) => save({ yFieldId: v || null })}
            options={numberFields.map((f) => [f.id, f.name] as [string, string])}
          />
        )}
      </div>
      {data && data.categories.length > 0 ? (
        <ReactECharts option={option} style={{ height: 420 }} notMerge />
      ) : (
        <p className="py-16 text-center text-[var(--muted)]">No hay datos para graficar.</p>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1 text-[var(--muted)]">
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[var(--foreground)]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
