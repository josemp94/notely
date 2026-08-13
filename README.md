# Notely

Clon de Notion **self-hosted a medida**: notas por bloques + bases de datos con vistas + **gráficas reales interactivas**. Gratis, en el NAS, y operable por API (para que el asistente lo mantenga solo).

## Stack
- **Next.js 15** (App Router) + **TypeScript**
- **tRPC** (API tipada) + **Prisma** + **PostgreSQL**
- **BlockNote** (editor de bloques tipo Notion)
- **Apache ECharts** (gráficas interactivas)
- **Tailwind CSS** + **Auth.js**
- Marca: `#ff5c28` · Bricolage Grotesque / Hanken Grotesk / IBM Plex Mono

## Roadmap
- **Fase 0** — Andamiaje: stack, esquema, branding, despliegue. ← *en curso*
- **Fase 1** — Editor de bloques + páginas
- **Fase 2** — Bases de datos + vistas (tabla/kanban)
- **Fase 3** — Gráficas / dashboards
- **Fase 4** — Multiusuario / familia
- **Fase 5** — Pulido + migración de datos

Planteamiento completo: `PLANTEAMIENTO.md`.

## Desarrollo
```bash
npm install
cp .env.example .env   # configurar DATABASE_URL
npx prisma migrate dev
npm run dev
```

Dev DB local (Postgres): `postgresql://notely:notely@localhost:5432/notely`
