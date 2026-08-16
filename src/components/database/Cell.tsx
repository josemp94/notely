"use client";

type Option = { id: string; label: string; color?: string };
export type FieldLite = { id: string; name: string; type: string; config: unknown };

const COLORS: Record<string, string> = {
  gray: "#e5e0d8",
  orange: "#ffd9c9",
  green: "#c9efd8",
  red: "#ffd2cd",
  blue: "#cfe0ff",
  yellow: "#fbeec2",
};

export function optionsOf(field: FieldLite): Option[] {
  const cfg = field.config as { options?: Option[] } | null;
  return cfg?.options ?? [];
}

export function Cell({
  field,
  value,
  onCommit,
  rollupValue,
}: {
  field: FieldLite;
  value: unknown;
  onCommit: (v: unknown) => void;
  rollupValue?: string | number;
}) {
  if (field.type === "rollup" || field.type === "formula") {
    const v = rollupValue;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {v === undefined || v === null || v === "" ? "—" : String(v)}
      </span>
    );
  }

  if (field.type === "relation") {
    const n = Array.isArray(value) ? value.length : 0;
    return (
      <span className="block px-1 py-0.5 text-sm text-[var(--muted)]">
        {n ? `${n} vinculado${n > 1 ? "s" : ""}` : "—"}
      </span>
    );
  }

  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onCommit(e.target.checked)}
        className="size-4 accent-[var(--color-brand,#ff5c28)]"
      />
    );
  }

  if (field.type === "select") {
    const opts = optionsOf(field);
    const current = opts.find((o) => o.id === value);
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onCommit(e.target.value || null)}
        className="w-full rounded bg-transparent px-1 py-0.5 text-sm outline-none"
        style={current ? { background: COLORS[current.color ?? "gray"] } : undefined}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        defaultValue={typeof value === "string" ? value : ""}
        onBlur={(e) => onCommit(e.target.value || null)}
        className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    );
  }

  // url / email / phone: input con tipo adecuado + enlace clicable si hay valor
  if (field.type === "url" || field.type === "email" || field.type === "phone") {
    const raw = value == null ? "" : String(value);
    const href =
      field.type === "email" ? `mailto:${raw}` : field.type === "phone" ? `tel:${raw}` : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return (
      <div className="flex w-full items-center gap-1">
        <input
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "url"}
          defaultValue={raw}
          onBlur={(e) => onCommit(e.target.value === "" ? null : e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        {raw && (
          <a href={href} target="_blank" rel="noreferrer" className="shrink-0 px-1 text-xs text-brand hover:underline" title="Abrir">
            ↗
          </a>
        )}
      </div>
    );
  }

  // text / number (no controlado; commit al salir)
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      defaultValue={value == null ? "" : String(value)}
      onBlur={(e) => {
        const raw = e.target.value;
        if (field.type === "number") onCommit(raw === "" ? null : Number(raw));
        else onCommit(raw === "" ? null : raw);
      }}
      className="w-full bg-transparent px-1 py-0.5 text-sm outline-none"
    />
  );
}
