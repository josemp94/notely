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
      setNameMsg("Guardado");
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

      <ApiTokensSection />
      <WebhooksSection />
    </div>
  );
}

function ApiTokensSection() {
  const utils = trpc.useUtils();
  const { data: tokens } = trpc.apiTokens.list.useQuery();
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const create = trpc.apiTokens.create.useMutation({
    onSuccess: ({ token }) => {
      setNewToken(token);
      setName("");
      utils.apiTokens.list.invalidate();
    },
  });
  const revoke = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => utils.apiTokens.list.invalidate(),
  });
  const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString() : "nunca");

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">API</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Tokens para la API REST (<code>/api/v1</code>), scopeados a este espacio. Ver{" "}
        <code>docs/api.md</code>.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del token (p. ej. «asistente finanzas»)"
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() => name.trim() && create.mutate({ name: name.trim() })}
          disabled={create.isPending || !name.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Crear token
        </button>
      </div>
      {newToken && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
          <p className="mb-1 text-xs text-[var(--muted)]">
            Copia el token ahora: no se volverá a mostrar.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{newToken}</code>
            <button
              onClick={() => navigator.clipboard.writeText(newToken)}
              className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--border)]/40"
            >
              Copiar
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 space-y-1">
        {tokens?.length === 0 && <p className="text-xs text-[var(--muted)]">Sin tokens.</p>}
        {tokens?.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              creado {fmt(t.createdAt)} · usado {fmt(t.lastUsed)}
            </span>
            <button
              onClick={() => {
                if (window.confirm(`¿Revocar el token «${t.name}»?`)) revoke.mutate({ id: t.id });
              }}
              className="shrink-0 text-xs text-red-500 hover:underline"
            >
              Revocar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Avisos salientes: una URL propia recibe un POST firmado cuando cambian las filas. */
function WebhooksSection() {
  const utils = trpc.useUtils();
  const { data: hooks } = trpc.webhooks.list.useQuery();
  const { data: me } = trpc.workspace.members.useQuery();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const create = trpc.webhooks.create.useMutation({
    onSuccess: (r) => {
      setSecret(r.secret);
      setUrl("");
      utils.webhooks.list.invalidate();
    },
  });
  const remove = trpc.webhooks.remove.useMutation({ onSuccess: () => utils.webhooks.list.invalidate() });

  if (!me?.isOwner) return null; // solo el propietario del espacio

  return (
    <section className="mt-8">
      <h2 className="font-display mb-1 font-bold">Avisos salientes (webhooks)</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Cada vez que se cree, edite o borre una fila, Notiono enviará un POST con el cambio a esta
        dirección. El cuerpo va firmado en la cabecera <code>X-Notiono-Signature</code> (HMAC-SHA256
        con el secreto), para que puedas comprobar que el aviso viene de aquí.
      </p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mi-servicio.local/hooks/notiono"
          className="flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={() =>
            url.trim() &&
            create.mutate({ url: url.trim(), events: ["record.created", "record.updated", "record.deleted"] })
          }
          disabled={create.isPending || !url.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Añadir aviso
        </button>
      </div>
      {create.error && <p className="mt-2 text-xs text-red-500">{create.error.message}</p>}
      {secret && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
          <p className="mb-1 text-xs text-[var(--muted)]">Copia el secreto ahora: no se volverá a mostrar.</p>
          <code className="break-all text-xs">{secret}</code>
        </div>
      )}
      <ul className="mt-3 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {(hooks ?? []).map((h) => (
          <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{h.url}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {h.lastAt
                ? `último: ${h.lastStatus === 0 ? "sin respuesta" : h.lastStatus} · ${new Date(h.lastAt).toLocaleDateString()}`
                : "sin enviar aún"}
            </span>
            <button onClick={() => remove.mutate({ id: h.id })} className="shrink-0 text-xs text-[var(--muted)] hover:text-red-500">
              Quitar
            </button>
          </li>
        ))}
        {!hooks?.length && <li className="px-3 py-3 text-sm text-[var(--muted)]">Ningún aviso configurado.</li>}
      </ul>
    </section>
  );
}
