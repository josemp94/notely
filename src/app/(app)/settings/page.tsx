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

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setPwMsg("Contraseña actualizada ✓");
      setCurrent("");
      setNext("");
    },
    onError: (e) => setPwMsg(e.message),
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:px-8 md:py-12">
      <h1 className="font-display mb-6 text-2xl font-extrabold md:text-3xl">Ajustes de cuenta</h1>

      <section className="mb-8">
        <div className="mb-2 text-sm text-[var(--muted)]">Email</div>
        <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          {me?.email ?? "…"}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display mb-2 font-bold">Nombre</h2>
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

      <section>
        <h2 className="font-display mb-2 font-bold">Cambiar contraseña</h2>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Contraseña actual"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Contraseña nueva (mín. 6)"
          className="mb-2 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => {
            setPwMsg(null);
            changePassword.mutate({ current, next });
          }}
          disabled={changePassword.isPending || next.length < 6}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Actualizar contraseña
        </button>
        {pwMsg && <p className="mt-2 text-xs text-[var(--muted)]">{pwMsg}</p>}
      </section>
    </div>
  );
}
