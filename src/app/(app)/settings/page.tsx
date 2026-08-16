"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/trpc/react";

export default function SettingsPage() {
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      setNameMsg("Guardado ✓");
      utils.auth.me.invalidate();
    },
    onError: (e) => setNameMsg(e.message),
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:px-8 md:py-12">
      <h1 className="font-display mb-6 text-2xl font-extrabold md:text-3xl">Ajustes de cuenta</h1>

      <section className="mb-8">
        <div className="mb-2 text-sm text-[var(--muted)]">Cuenta (SSO)</div>
        <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          {me?.email ?? "…"}
          {me?.role === "admin" && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">admin</span>}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 font-bold">Nombre visible</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={() => {
              setNameMsg(null);
              updateProfile.mutate({ name });
            }}
            disabled={updateProfile.isPending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
        {nameMsg && <p className="mt-2 text-xs text-[var(--muted)]">{nameMsg}</p>}
      </section>
    </div>
  );
}
