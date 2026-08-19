@AGENTS.md

# Notiono — contexto para Claude Code (handoff)

Clon de **Notion** self-hosted a medida para Jose y su familia. Objetivo: paridad con Notion lo más alta posible, gratis, autoalojado en el NAS. Este documento te da TODO lo necesario para seguir el desarrollo tú solo, igual que lo venía haciendo el asistente (Dobby).

## Stack y estructura
- **Next.js 15 (App Router) + TypeScript estricto + tRPC + Prisma + PostgreSQL + TailwindCSS**.
- Editor: **BlockNote** (con custom blocks/inline content propios). Iconos de interfaz: **lucide-react** (NO emojis/símbolos en el chrome). Gráficas: ECharts. Índices fraccionales: `fractional-indexing`.
- Repo en el PC: `~/Projects/notiono` (el remoto es `git@github.com:josemp94/notiono.git`, rama `main`).
- **Auth = SOLO SSO (Synology OIDC)**, sin cuentas locales. El alta ocurre en el callback OIDC; primer usuario = admin. Rutas públicas fuera del grupo `(app)`: `/login`, `/s/[token]` (páginas publicadas), `/api/*`.
- Multiusuario por **workspace** (Membership). `workspaceProcedure` da `ctx.user` y `ctx.workspace`.

## Qué está HECHO (a 19-ago-2026, commit ~2939ccf)
Editor de páginas con bloques + autosave; árbol de páginas en el sidebar; **bases de datos** con 7 vistas (Tabla, Kanban, Lista, Galería, Calendario, Gráfica, Formulario) + **Cronograma/Timeline**; tipos de campo (texto, número, select, multiselect, estado, fecha, casilla, URL, correo, teléfono, fecha creación/edición, **ID único**, relación, rollup, fórmula); editor de etiquetas tipo Notion; filtros (con **grupos AND/OR anidados**), orden, visibilidad de columnas, fila de totales; **subtareas** (Record.parentId, árbol expandible); fila-como-página (Record.content); **relaciones + rollups + fórmulas**. **Menciones @** (páginas y personas) + **bandeja de notificaciones** 🔔. **Comentarios** de página. **Duplicar** página (copia profunda). **Plantillas** (galería, `pages.createFromTemplate`). **Publicar página** (ruta pública `/s/<token>` solo lectura). **Importar/Exportar** (página↔Markdown, BD↔CSV). **Historial de versiones**. **Favoritos + Recientes**. **Papelera** con auto-purga 30 días + vaciar + buscar. **PWA instalable** (manifest + service worker + responsive con drawer). **API REST v1 con tokens** (`/api/v1`, ver `docs/api.md`). **Modo oscuro** (data-theme). **Bases de datos embebidas** dentro de páginas (bloque BlockNote "database"). **Favicon + iconos de marca**. **Iconos unificados a lucide-react**. **Portada de página** (gradientes, URL y **subir imagen** vía `Asset`/`/api/upload`+`/api/asset/[id]`). **Miga de pan + "Mover a" + Ancho completo**.

## Roadmap / PENDIENTE
- **Colaboración en tiempo real (Yjs)** — la gran función que queda. Requiere añadir un servicio websocket (p.ej. Hocuspocus) al docker-compose + integrar BlockNote collaboration + auth por sala + persistencia + una entrada de proxy inverso en DSM para `wss`. Hacerlo con Jose delante (él añade la línea del proxy y prueba entre 2 usuarios).
- Webhooks salientes; notificaciones push reales (el service worker ya está); más pulido.
- **Inventario y gap-analysis completo en `docs/notion-parity.md`** — consúltalo para decidir qué construir y en qué orden.

## Convenciones (IMPORTANTE, seguir siempre)
- **TypeScript estricto**; `npm run build` debe quedar LIMPIO antes de commitear.
- **Migraciones de Prisma A MANO**: crea `prisma/migrations/<timestamp>_nombre/migration.sql` con el SQL (ALTER/CREATE), y ejecuta `npx prisma generate` tras tocar el schema. NO uses `prisma migrate dev` (el deploy aplica con `prisma migrate deploy`). El SQL debe ser válido para Postgres 16.
- **Un commit por función**, mensaje claro y descriptivo (en español, estilo `feat: ...`). NO hagas push automático salvo que se pida.
- **Marca**: naranja `#ff5c28`; tokens CSS `var(--bg/--fg/--border/--muted/--brand)`; **modo oscuro** por `data-theme` en `<html>` (respétalo en todo, incl. BlockNoteView, modales, BD y páginas `/s/`).
- **Iconos**: interfaz/chrome → **lucide-react** (size ~16-18, strokeWidth ~1.75, `currentColor`). Los **iconos de página que elige el usuario son emojis** (PageIcon.tsx) — eso NO se toca, es contenido, como en Notion.
- **Nombres de archivo** al generar/enviar ficheros: SIN acentos, espacios ni caracteres especiales (guiones_bajos) — si no, se rompe el envío por WhatsApp.
- No rompas: SSO, rutas públicas `/s/`, el editor, las BD, el árbol del sidebar.

## Build y DESPLIEGUE
1. `npm run build` para verificar (arregla todos los errores TS/lint).
2. `git add -A && git commit` (uno por función) y `git push origin main`.
3. **Despliegue en el NAS** (Synology, Docker): la app corre en 3 contenedores (`notiono-app` puerto host 3010, `notiono-db` postgres, `notiono-migrate` one-shot) en `/volume1/homes/Dobby/notiono`, tras un proxy inverso DSM → `notiono.monrealperez.com`. El NAS NO tiene git; se despliega por tar+SSH y `sudo docker compose up -d --build` (aplica migraciones solo). **Ese paso lo hace el asistente (Dobby)**: cuando termines una función y quieras verla en producción, díselo a Jose y él le pide a Dobby "despliega Notiono" (es barato en tokens, solo el deploy). Tú céntrate en programar y dejar el build limpio + commit.
- Nota: el `docker-compose.yml` del repo ya está bien (nombres `notiono-*`, app `3010:3000`, db con `expose` SIN puerto host para no chocar con un postgres del sistema). NO mapees la db al puerto 5432 del host.

## Cómo trabajar (para Jose)
Abre una terminal en `~/Projects/notiono` y ejecuta `claude`. Pídele en lenguaje natural la siguiente función (p.ej. "implementa la colaboración en tiempo real según el roadmap de docs/notion-parity.md, con migración a mano si hace falta, build limpio y un commit"). Claude Code leerá este CLAUDE.md y tendrá todo el contexto. Para ver los cambios en producción, pídele a Dobby que despliegue.
