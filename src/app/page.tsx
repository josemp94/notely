export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] mb-8">
          <span className="size-2 rounded-full bg-brand" />
          self-hosted · en tu NAS
        </div>

        <h1 className="font-display text-6xl font-extrabold tracking-tight">
          Note<span className="text-brand">ly</span>
        </h1>

        <p className="mt-5 text-lg text-[var(--muted)]">
          Tu espacio de trabajo: notas por bloques, bases de datos con vistas y{" "}
          <span className="text-[var(--foreground)] font-medium">gráficas reales</span>.
          Tuyo, gratis y sin límites.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3">
          <a
            href="/login"
            className="rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-600 transition-colors"
          >
            Entrar
          </a>
          <span className="font-mono text-xs text-[var(--muted)]">v0 · Fase 0</span>
        </div>
      </div>

      <footer className="absolute bottom-6 font-mono text-xs text-[var(--muted)]">
        Notely — hecho a medida 🧡
      </footer>
    </main>
  );
}
