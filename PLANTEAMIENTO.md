# Proyecto **Aurora** — Clon de Notion self-hosted a medida para Jose
### Planteamiento técnico completo (documento maestro) · v1 · 2026-08-13

> Nombre provisional **Aurora** (renombrable). Objetivo: un espacio de trabajo tipo Notion —
> notas por bloques + bases de datos con vistas + **gráficas/dashboards reales**— alojado en el NAS,
> 100% gratis, mantenido/operado por Dobby (IA) vía API y editable por Jose en la web.

---

## 0. Índice
1. Visión, alcance y principios
2. Arquitectura general y stack
3. Modelo de datos y almacenamiento
4. Editor de bloques (el corazón Notion)
5. Bases de datos y vistas
6. Gráficas y dashboards (el diferenciador)
7. Sincronización, guardado y colaboración
8. Autenticación, multiusuario y permisos
9. API y automatización (cómo lo mantiene Dobby)
10. Despliegue, DevOps y operación en el NAS
11. Migración de datos y branding
12. Roadmap por fases, testing, riesgos y decisiones abiertas

---

## 1. Visión, alcance y principios

**Qué es (y qué no).** Aurora replica *lo esencial* de Notion, no el 100%. El foco: (a) editor de páginas por bloques, (b) bases de datos con múltiples vistas, (c) **gráficas interactivas** ligadas a esos datos —lo que ninguna alternativa libre te daba gratis—, y (d) que un agente (Dobby) pueda crear/actualizar todo por API.

**Prioridad de funcionalidades**
- **MUST (MVP, Fases 1–3):** cuentas/login; workspaces y páginas anidadas; editor de bloques (texto, encabezados, listas, to‑do, toggle, callout, cita, código, divisor, imagen, enlace/embed, referencia a página); bases de datos con vista **tabla** y **kanban**; tipos de columna esenciales (texto, número, select, multiselect, fecha, checkbox, moneda, fórmula simple); **gráficas** (barras, líneas, tarta/donut, KPI) sobre una vista; papelera; buscador; API para Dobby.
- **SHOULD (Fase 4):** vistas calendario/galería/lista; relaciones y rollups; filtros/orden/agrupación avanzados; multiusuario real (roles, compartir); historial de versiones; adjuntos.
- **LATER:** colaboración en tiempo real (varios a la vez), comentarios, plantillas, IA integrada, apps móviles/PWA offline, pizarra.

**Principios**
- *Pragmatismo sobre pureza:* usar librerías maduras (no reinventar el editor ni el motor de gráficas).
- *Operable por IA:* toda acción de usuario tiene equivalente por API (Dobby es un "usuario de primera clase").
- *Datos tuyos:* Postgres en tu NAS, export fácil, sin lock‑in.
- *Estética cuidada:* tu marca desde el día 1 (no "hecho por Claude Code").
- *Incremental y siempre desplegable:* cada fase deja algo usable en producción.

**Criterios de éxito (medibles):** crear una página con 10 tipos de bloque y recargar sin pérdidas; crear una base de datos de finanzas, verla en tabla+kanban y un dashboard con 3 gráficas que se actualizan al cambiar datos; Dobby inserta el extracto mensual por API y las gráficas reflejan el cambio sin tocar nada a mano; carga de página < 1,5 s en el NAS.

---

## 2. Arquitectura general y stack

**Decisión de stack (con justificación):**
- **Frontend + backend: Next.js 15 (App Router) + React 18 + TypeScript.** Un solo proyecto full‑stack, SSR para carga rápida, ecosistema enorme. Build **standalone** (imagen ligera para el NAS).
- **API interna: tRPC.** Tipado extremo a extremo cliente↔servidor sin escribir contratos a mano; acelera muchísimo el desarrollo por un solo dev.
- **ORM: Prisma** sobre **PostgreSQL**. Reutilizamos el Postgres ya corriendo en el NAS (creando una BD `aurora` separada, no tocamos la de AFFiNE).
- **Cache/colas/pubsub: Redis** (el que ya corre) — sesiones, rate‑limit y, más adelante, canal pubsub para tiempo real.
- **Editor de bloques: BlockNote** (React, basado en ProseMirror; da la experiencia Notion —slash menu, drag&drop— casi lista; MIT). Alternativa evaluada: BlockSuite (más potente pero más complejo) y Tiptap/Lexical (más "a pelo"). Elegimos BlockNote por velocidad de MVP.
- **Gráficas: Apache ECharts** (`echarts-for-react`). Potente, interactivo (zoom, tooltip, filtros), gratis, muchísimos tipos. Recharts sería más "React‑friendly" pero ECharts gana en potencia/rendimiento.
- **Estilos: Tailwind CSS + shadcn/ui** (Radix) con variables de tema para tu marca.
- **Auth: Auth.js (NextAuth)** con proveedor de credenciales + sesiones en BD.
- **Almacenamiento de ficheros:** volumen local del NAS (carpeta `/uploads`) servido por la app; opción futura S3‑compatible (MinIO).

**Diagrama de componentes (flujo):**
```
[Navegador/PWA]  <-- HTTPS -->  [Reverse Proxy Synology + Let's Encrypt]
      |  (tRPC/HTTP, WS futuro)             |  (app.monrealperez.com)
      v                                     v
[Next.js (Aurora) contenedor Docker] --> [PostgreSQL (BD 'aurora')]
      |            |                         ^
      |            +--> [Redis] (cache/pubsub)|
      |                                       |
      +--> [/uploads volumen NAS]             |
                                              |
[Dobby / crons OpenClaw] --REST token API-----+  (mantiene finanzas, tareas, dashboards)
```

**Por qué resuelve lo que las otras no:** una sola app que junta editor Notion + bases de datos + **gráficas nativas** (ECharts) sin muros de pago, y con una **API pensada para que Dobby la conduzca**.

---

## 3. Modelo de datos y almacenamiento

Enfoque **híbrido** (lo mejor de cada mundo):
- **Contenido de páginas = documento JSON por página** (el doc de BlockNote/ProseMirror en una columna `JSONB`). Sencillo, atómico, sin explotar millones de filas de bloques. El versionado guarda snapshots del doc.
- **Bases de datos del usuario = filas reales** (para poder filtrar/agrupar/graficar de verdad con SQL).

**Entidades clave (Prisma orientativo):**
```prisma
model User      { id String @id @default(cuid()) email String @unique name String? passwordHash String? role String @default("member") createdAt DateTime @default(now()) }
model Workspace { id String @id @default(cuid()) name String icon String? ownerId String createdAt DateTime @default(now()) }
model Member    { id String @id @default(cuid()) workspaceId String userId String role String } // owner|editor|viewer

model Page {
  id String @id @default(cuid())
  workspaceId String
  parentId String?              // árbol anidado
  title String @default("")
  icon String?
  order String                  // índice fraccional (orden estable sin renumerar)
  type String @default("doc")   // doc | database
  content Json?                 // doc de bloques (si type=doc)
  archivedAt DateTime?          // papelera
  updatedAt DateTime @updatedAt
}

// Bases de datos del usuario
model Collection { id String @id @default(cuid()) pageId String name String }
model Field  { id String @id @default(cuid()) collectionId String name String type String order String config Json } // type: text,number,select,multiselect,date,checkbox,currency,relation,rollup,formula,url
model Record { id String @id @default(cuid()) collectionId String cells Json order String createdAt DateTime @default(now()) updatedAt DateTime @updatedAt } // cells = { fieldId: value }
model View   { id String @id @default(cuid()) collectionId String name String type String config Json } // type: table,kanban,calendar,gallery,list ; config: filtros/orden/agrupación/columnas
model Chart  { id String @id @default(cuid()) pageId String name String spec Json } // spec: fuente(collection/view)+agregación+tipo+estilo

model Version { id String @id @default(cuid()) pageId String snapshot Json createdAt DateTime @default(now()) authorId String? }
```

**Notas de diseño:**
- **Orden fraccional** (p.ej. librería `fractional-indexing`) para reordenar páginas/campos/registros sin renumerar toda la lista.
- **Celdas como JSONB** por flexibilidad; para gráficas se agregan con SQL (`jsonb` + índices GIN donde haga falta) o materializando columnas de las que más se filtran (fecha/importe).
- **Papelera** = `archivedAt` (soft delete) + purga a los 30 días.
- **Trade‑off elegido:** documento JSON para notas (simple y rápido) vs filas para datos (consultable). Evitamos CRDT en el MVP (ver §7).

---

## 4. Editor de bloques (el corazón Notion)

**Base: BlockNote.** Nos da de fábrica: menú `/` (slash), arrastrar/soltar y reordenar por el "handle", selección multi‑bloque, atajos, pegado desde markdown/HTML, y un modelo de bloques serializable a JSON. Sobre esa base añadimos **bloques personalizados**:
- Estándar: párrafo, H1–H3, lista con viñetas/numerada, **to‑do**, **toggle**, **callout**, cita, **código** (resaltado), divisor, imagen, tabla simple.
- Ricos/propios: **enlace/embed** (YouTube, web, con preview), **referencia a página** (`@página`), **base de datos embebida** (renderiza una `View`), **gráfica embebida** (renderiza un `Chart`).

**Serialización:** cada bloque → nodo del doc JSON de la página (`Page.content`). Autosave con *debounce* (§7).

**Riesgos y cómo se acotan:** el editor es la parte más peligrosa en complejidad → por eso NO lo construimos desde cero. En el MVP limitamos la lista de bloques a los "estándar" + referencia a página; los bloques que renderizan bases de datos/gráficas llegan en Fase 2–3 cuando esas piezas existan.

---

## 5. Bases de datos y vistas

**Motor de colecciones** con campos tipados y vistas configurables.
- **Tipos de columna (MVP):** texto, número, **moneda**, select, multiselect, fecha, checkbox, url. **Fase 4:** relación, rollup, fórmula.
- **Vistas (MVP):** **tabla** (edición inline, columnas ocultas/anchos, orden, filtros) y **kanban** (agrupado por un select). **Fase 4:** calendario (por campo fecha), galería (tarjetas), lista.
- **Filtros/orden/agrupación:** definidos en `View.config` (JSON) y traducidos a consulta SQL sobre `Record.cells`.
- **Fórmulas/rollups (Fase 4):** motor seguro y acotado (evaluador propio de expresiones tipo `importe * 1.21`, sin `eval`), no Turing‑completo, para evitar agujeros y sobre‑ingeniería. Rollups = agregación sobre registros relacionados.

**MVP mínimo útil:** una colección "Movimientos" con fecha, importe, categoría (select), tipo (ingreso/gasto), vista tabla + kanban por categoría. Suficiente para alimentar las gráficas de finanzas.

---

## 6. Gráficas y dashboards (el diferenciador)

**Motor: ECharts.** Cada **Chart** tiene un `spec` que define:
- **Fuente:** una `Collection`/`View` (con sus filtros aplicados).
- **Agregación:** group‑by (p.ej. por mes de un campo fecha, o por categoría) + medida (`sum`/`avg`/`count`/`min`/`max`) sobre un campo numérico.
- **Tipo:** barras (agrupadas/apiladas), líneas, área, tarta/donut, **KPI/número**, combo (barras + línea).
- **Estilo:** paleta con tu naranja, formato € y miles, leyenda, ejes.

**Interactividad real:** tooltips, zoom, click‑para‑filtrar, y **drill‑down** (de "gasto por mes" a "movimientos de ese mes"). Un **dashboard** = una página con varias gráficas embebidas + KPIs, con un filtro global (rango de fechas).

**Ejemplo aterrizado (finanzas Jose):** dashboard "Finanzas 2026" con: KPI balance neto acumulado; barras Ingresos vs Gastos por mes + línea de balance; donut/barh de top categorías; todo recalculado por SQL cuando Dobby inserta el extracto. **Interactivo y en vivo, no imágenes.**

**Cálculo:** las agregaciones se hacen en el servidor (SQL sobre `Record.cells`) y se cachean en Redis; el cliente solo pinta. Así aguanta bien en el NAS.

---

## 7. Sincronización, guardado y colaboración

Decisión honesta y anti‑sobre‑ingeniería, por fases:
- **MVP (1 usuario, multi‑dispositivo secuencial):** **autosave por REST/tRPC con *debounce*** (~800 ms) + **UI optimista** + indicador "Guardando…/Guardado". Bloqueo suave por versión (si el server tiene una versión más nueva, avisa). Cubre el 95% del uso real de Jose.
- **Fase 4 (familia, edición concurrente ocasional):** WebSocket para *presencia* y refresco en vivo de listas/tableros vía Redis pubsub.
- **LATER (edición simultánea del mismo doc, tipo Google Docs):** **Yjs + Hocuspocus** (CRDT) solo si de verdad hace falta. No se mete antes porque multiplica la complejidad.

**Offline:** no en el MVP; más adelante PWA con cola de cambios.

---

## 8. Autenticación, multiusuario y permisos

- **Auth.js (credenciales):** email + contraseña (hash Argon2/bcrypt), sesiones en BD, cookies httpOnly, CSRF, rate‑limit en login (Redis). Opción futura OIDC.
- **Roles:** a nivel workspace (**owner/editor/viewer**) y compartición por página (Fase 4). MVP: mono‑usuario (Jose owner).
- **Uso familiar (Fase 4):** cada persona = usuario; cada uno con su(s) workspace(s); aislamiento por membresía (nunca ves lo que no te comparten). Encaja con la filosofía que ya usamos para la familia en OpenClaw.
- **Acceso de Dobby:** **cuenta de servicio** + **API token** (scope configurable). Dobby actúa como usuario con permisos, respetando el modelo (no puertas traseras). Los tokens se guardan en `secrets/` como el resto.
- **Seguridad de sesión:** expiración, rotación, logout global; al estar expuesto a internet, cabecera de seguridad (CSP, HSTS) y 2FA opcional a futuro.

---

## 9. API y automatización (cómo lo mantiene Dobby)

Aurora es "operable por IA" por diseño. Dos superficies:
- **tRPC** para la app web.
- **API REST con token** para automatización (Dobby y crons de OpenClaw). Endpoints clave:
  - `POST /api/v1/pages` (crear/actualizar página y su contenido de bloques)
  - `POST /api/v1/collections/:id/records` (upsert de filas; **idempotente** por clave natural, p.ej. `(fecha,importe,saldo)` de un movimiento)
  - `PATCH /api/v1/records/:id`, `DELETE …`
  - `POST /api/v1/charts/:id/refresh` (invalida cache y recalcula)
  - `GET /api/v1/collections/:id/records?filter=…` (lectura)
  - **Webhooks** salientes (evento → cron/Dobby) para reaccionar a cambios.
- **Idempotencia** y *upsert* para que los crons puedan re‑ejecutarse sin duplicar.
- **Casos concretos que automatiza Dobby:** al llegar el extracto → parsea, hace upsert de movimientos, recategoriza, y las gráficas se actualizan solas; alta de deducibles/facturas desde el cron de correo; alta de tareas. Todo lo que hoy hago con scripts, contra esta API.

---

## 10. Despliegue, DevOps y operación en el NAS

- **Contenedores (docker‑compose):** servicio `aurora` (Next standalone) + reutiliza `postgres` y `redis` existentes (red Docker compartida). Volumen `/uploads`.
- **Exposición:** subdominio **app.monrealperez.com** (o `notas.…`) por el **reverse proxy de Synology** + **DNS Cloudflare** + **Let's Encrypt** (mismo patrón ya probado con AFFiNE). WebSocket habilitado en el proxy (para Fase 4).
- **Config/secretos:** `.env` + `secrets/aurora.env` (DB, NEXTAUTH_SECRET, tokens). Nunca en el repo.
- **Migraciones:** `prisma migrate` en el arranque (job controlado).
- **Backups:** dump diario de la BD `aurora` + copia de `/uploads` al NAS (y a carpeta ya respaldada). Restauración documentada.
- **Actualizaciones:** build de imagen versionada; `docker compose up -d` con la nueva; rollback = imagen anterior. Dobby lo hace por SSH temporal (como ahora).
- **Recursos:** Next standalone + Postgres/Redis compartidos caben de sobra en 12 GB; límites de memoria por contenedor para no ahogar el resto.
- **Observabilidad:** logs estructurados, healthcheck `/api/health`, y avisos a Dobby si cae.
- **Hardening:** CSP/HSTS, rate‑limit, cabeceras seguras, dependencias auditadas, backups cifrados.

---

## 11. Migración de datos y branding

**Migración (script de una vez, vía API):**
- **Finanzas:** del export NocoDB (`workspace/nocodb-export/*.json`) → colección "Movimientos" (460 filas), "Resumen mensual", "Categorías", "Deducibles", "Facturas". Mapear campos y tipos.
- **Tareas:** de `Tareas.json` → colección "Tareas" (estado/área/prioridad/límite) con vista kanban.
- **Notas/hub AFFiNE:** re‑creación de las páginas clave (Inicio, Proyectos, Casa, etc.) como docs de bloques.

**Branding/tema:**
- Variables CSS + Tailwind: primario **#ff5c28**; tipografías **Bricolage Grotesque** (titulares), **Hanken Grotesk** (texto), **IBM Plex Mono** (números/código). Modo claro/oscuro.
- Guía de estilo UI (espaciados, radios, sombras suaves, iconografía coherente) para que se vea pulido y personal. Logo/emoji propio y favicon.

---

## 12. Roadmap por fases, testing, riesgos y decisiones abiertas

**Fases (cada una deja algo usable en producción):**
- **Fase 0 — Andamiaje (≈2–3 días):** repo, Next+TS+Tailwind+Prisma+Auth, Docker en el NAS, dominio+SSL, CI. *Entregable:* login y una página en blanco desplegada.
- **Fase 1 — Editor + páginas (≈1–1,5 sem):** BlockNote, bloques estándar, árbol de páginas, autosave, papelera, buscador. *Entregable:* tomar notas de verdad.
- **Fase 2 — Bases de datos + vistas (≈1,5–2 sem):** colecciones, campos tipados, vista tabla + kanban, filtros/orden. *Entregable:* gestionar movimientos/tareas.
- **Fase 3 — Gráficas/dashboards (≈1 sem):** ECharts, specs de gráfica, dashboard de finanzas, cache. *Entregable:* **el diferenciador funcionando en vivo.**
- **Fase 4 — Multiusuario/familia + vistas extra + relaciones/rollups (≈2 sem).**
- **Fase 5 — Pulido, branding fino, migración total, PWA (≈1 sem).**

*(Estimaciones para desarrollo asistido por IA a tiempo parcial; ajustables.)*

**Estrategia de testing (a fondo):**
- **Unit (Vitest):** motor de agregación de gráficas, filtros, fórmulas, orden fraccional, serialización de bloques.
- **Integración:** capa tRPC/REST + Prisma contra una BD de test.
- **E2E (Playwright):** flujos reales —crear página con N bloques y recargar; crear colección, meter registros, ver kanban; crear gráfica y comprobar que refleja los datos; login/permresos. Con **datos semilla** deterministas.
- **Pruebas de la API de Dobby:** suite que inserta un extracto de ejemplo y verifica idempotencia + refresco de gráficas.
- **CI:** lint + typecheck + unit + e2e en cada cambio. **Definición de "perfecto" por fase:** criterios de aceptación escritos + e2e en verde + revisión manual en el NAS.

**Riesgos y mitigaciones:**
- *Complejidad del editor* → usar BlockNote, acotar bloques por fase.
- *Scope creep (querer todo Notion)* → lista MUST/SHOULD/LATER congelada por fase.
- *Rendimiento de agregaciones en JSONB* → índices + materializar campos calientes + cache Redis.
- *Sync/colaboración* → diferir CRDT hasta que haga falta.
- *Recursos NAS* → Next standalone, límites por contenedor, reutilizar Postgres/Redis.
- *Bus factor (lo mantiene Dobby)* → código pequeño, tipado, tests; todo documentado en el repo.

**Decisiones abiertas (necesito tu OK antes de Fase 1):**
1. **Nombre** del proyecto/dominio (Aurora → `app.monrealperez.com`? ¿otro nombre/subdominio?).
2. **Editor:** confirmo **BlockNote** (rápido y Notion‑like) salvo que prefieras BlockSuite (más potente, más lento de construir).
3. **Alcance del MVP familiar:** ¿mono‑usuario tú primero (recomendado) y familia en Fase 4, o multiusuario desde el principio?
4. **Dónde vive el código:** repo en tu Gitea/GitHub, y build en el NAS o en el PC.
5. **¿Reutilizo el Postgres de AFFiNE (BD separada) o levanto uno propio para Aurora?** (Recomiendo BD separada en el mismo Postgres.)

---
*Documento vivo. Al aprobar, arrancamos por la Fase 0 y vamos enseñando resultados fase a fase.*
