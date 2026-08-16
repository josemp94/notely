"use client";

export default function LoginPage() {
  const oidcEnabled = process.env.NEXT_PUBLIC_OIDC_ENABLED === "1";
  const name = process.env.NEXT_PUBLIC_OIDC_NAME || "Synology";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="font-display mb-1 text-3xl font-extrabold">
          Note<span className="text-brand">ly</span>
        </h1>
        <p className="mb-6 text-sm text-[var(--muted)]">Entra con tu cuenta de {name}.</p>

        {oidcEnabled ? (
          <a
            href="/api/auth/oidc/start"
            className="block w-full rounded-lg bg-brand px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Entrar con {name}
          </a>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            El acceso por SSO aún no está configurado en este entorno.
          </p>
        )}
      </div>
    </div>
  );
}
