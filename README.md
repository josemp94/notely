# Notiono

Clon de **Notion** self-hosted a medida: páginas con bloques + bases de datos con vistas + gráficas interactivas. Gratis, autoalojado en el NAS y operable por API.

## Stack
- **Next.js 16** (App Router) + **TypeScript** estricto
- **tRPC** (API tipada) + **Prisma** + **PostgreSQL 16**
- **BlockNote** (editor de bloques) + custom blocks propios
- **Apache ECharts** (gráficas) · **lucide-react** (iconos de interfaz)
- **Tailwind CSS v4** · Auth **SSO-only** (Synology OIDC)
- Marca: `#ff5c28`

## Estado
Ver `CLAUDE.md` (contexto y estado actual) y `docs/notion-parity.md` (inventario y gap-analysis frente a Notion).
API REST v1 documentada en `docs/api.md`.

## Desarrollo
```bash
npm install
cp .env.example .env   # configurar DATABASE_URL
npx prisma migrate deploy
npm run dev
```

Dev DB local (Postgres): `postgresql://notely:notely@localhost:5432/notely`
(el rol/base de datos conserva el nombre original del proyecto; renombrarlo obligaría a migrar los datos sin ninguna ganancia).

## Despliegue
Docker Compose en el NAS: `notiono-app` (:3010), `notiono-db`, `notiono-migrate`, tras proxy inverso DSM → `notiono.monrealperez.com`.
