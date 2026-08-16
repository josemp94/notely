"use client";

import { useState } from "react";
import { trpc } from "@/trpc/react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = () => {
    window.location.href = "/";
  };
  const login = trpc.auth.login.useMutation({ onSuccess: go, onError: (e) => setError(e.message) });
  const signup = trpc.auth.signup.useMutation({ onSuccess: go, onError: (e) => setError(e.message) });
  const busy = login.isPending || signup.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "login") login.mutate({ email, password });
    else signup.mutate({ email, password, name });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[var(--border)] p-8 shadow-sm">
        <h1 className="font-display mb-1 text-3xl font-extrabold">
          Note<span className="text-brand">ly</span>
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          {mode === "login" ? "Entra en tu espacio." : "Crea tu cuenta."}
        </p>

        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
        )}
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
          disabled={busy}
          className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>

        {process.env.NEXT_PUBLIC_OIDC_ENABLED === "1" && (
          <>
            <div className="my-4 flex items-center gap-2 text-[10px] uppercase text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--border)]" />o<span className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <a
              href="/api/auth/oidc/start"
              className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-center text-sm font-medium hover:border-brand hover:text-brand"
            >
              Entrar con {process.env.NEXT_PUBLIC_OIDC_NAME || "Synology"}
            </a>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-[var(--muted)] hover:text-brand"
        >
          {mode === "login" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Entra"}
        </button>
      </form>
    </div>
  );
}
