"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: localAllowed } = trpc.auth.localLoginAllowed.useQuery();
  const oidcEnabled = process.env.NEXT_PUBLIC_OIDC_ENABLED === "1";

  const go = () => {
    window.location.href = "/";
  };
  const login = trpc.auth.login.useMutation({ onSuccess: go, onError: (e) => setError(e.message) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] p-8 shadow-sm">
        <h1 className="font-display mb-1 text-3xl font-extrabold">
          Note<span className="text-brand">ly</span>
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">Entra en tu espacio.</p>

        {oidcEnabled && (
          <a
            href="/api/auth/oidc/start"
            className="mb-4 block w-full rounded-lg bg-brand px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Entrar con {process.env.NEXT_PUBLIC_OIDC_NAME || "Synology"}
          </a>
        )}

        {/* Login local: solo como respaldo mientras el SSO no está configurado */}
        {localAllowed && (
          <>
            {oidcEnabled && (
              <div className="my-4 flex items-center gap-2 text-[10px] uppercase text-[var(--muted)]">
                <span className="h-px flex-1 bg-[var(--border)]" />o<span className="h-px flex-1 bg-[var(--border)]" />
              </div>
            )}
            <form onSubmit={submit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="mb-3 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                required
                className="mb-3 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {error && <p className="mb-3 text-sm text-[var(--negative,#c93a2e)]">{error}</p>}
              <button
                type="submit"
                disabled={login.isPending}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:border-brand hover:text-brand disabled:opacity-50"
              >
                {login.isPending ? "…" : "Entrar"}
              </button>
            </form>
          </>
        )}

        {!localAllowed && !oidcEnabled && (
          <p className="text-sm text-[var(--muted)]">
            El acceso está configurado por SSO. Falta habilitar el botón de inicio de sesión.
          </p>
        )}

        {oidcEnabled && !localAllowed && error && (
          <p className="mt-3 text-sm text-[var(--negative,#c93a2e)]">{error}</p>
        )}
      </div>
    </div>
  );
}
