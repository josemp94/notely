# Notiono — Biblia de paridad con Notion

> Documento maestro para llevar Notiono lo más cerca posible de Notion 1:1.
> Basado en investigación (agosto 2026) de la documentación oficial de Notion por 4 agentes.
> Leyenda de estado: ✅ hecho · 🟡 parcial · ❌ falta.

---

## 0. Estado actual de Notiono (agosto 2026)

- ✅ Editor de bloques (BlockNote), autosave.
- ✅ Árbol de páginas en sidebar (crear, subpágina, menú ⋯, papelera con jerarquía).
- ✅ Icono de página (emoji) editable; título grande.
- ✅ Bases de datos: 7 vistas (Tabla, Kanban, Lista, Galería, Calendario, Gráfica, Formulario); empieza solo con columna "Nombre" + filas vacías.
- ✅ Tipos de campo: texto, número, selección, casilla, fecha, URL, correo, teléfono, relación, rollup, fórmula.
- ✅ Filtros y orden por vista; añadir/renombrar/borrar vista; "Mostrar como" (cambiar tipo).
- ✅ Auth SSO (Synology OIDC), compartir espacios + roles (owner/editor/viewer), viewer solo-lectura.
- ✅ Modelo Version (BD) — sin UI todavía.

---

## 1. BASES DE DATOS

### 1.1 Tipos de propiedad (Notion tiene ~24)
| Tipo | Notion | Notiono |
|---|---|---|
| Título / Texto / Número / Selección / Multi-selección / Fecha / Casilla / URL / Correo / Teléfono | ✅ | ✅ (multi-selección ❌; número sin formatos moneda/%/barra/anillo 🟡; fecha sin rango/hora/recordatorio 🟡) |
| Relación / Rollup / Fórmula | ✅ | ✅ (fórmula básica; relación unidireccional 🟡) |
| **Estado (grupos To-do/In Progress/Complete)** | ✅ | ❌ (usamos select) |
| **Persona** (miembros del espacio) | ✅ | ❌ |
| **Archivos y multimedia** | ✅ | ❌ (necesita subida de ficheros) |
| **Fecha de creación / Última edición / Creado por / Editado por** | ✅ | ❌ (createdAt/updatedAt existen en BD; falta exponerlos) |
| **ID único** (con prefijo) | ✅ | ❌ |
| **Botón** (acciones) | ✅ | ❌ |
| **Lugar** (mapa) | ✅ | ❌ |

**Prioridad de tipos a añadir:** 1) Estado, Multi-selección, Fecha de creación/edición, ID (fáciles/útiles). 2) Persona (requiere lista de miembros). 3) Archivos (requiere almacenamiento). 4) Número con formatos (moneda/%/barra/anillo). 5) Botón, Lugar (nicho).

### 1.2 Tipos de vista (Notion: 10)
Tenemos ✅ Tabla, Kanban, Lista, Galería, Calendario, Gráfica, Formulario.
Faltan: ❌ **Cronograma/Timeline** (Gantt con barras por rango de fechas), ❌ **Mapa** (pins, requiere campo Lugar), ❌ **Feed** (publicaciones tipo blog), ❌ **Panel de control/Dashboard** (rejilla de widgets con filtros globales).

### 1.3 Config de vistas (parcial)
- 🟡 Filtros: tenemos simples; falta **AND/OR anidados** (hasta 3 niveles) y operadores completos por tipo (starts/ends with, is within para fechas, etc.).
- 🟡 Orden: multi-nivel ✅; falta orden por opciones de select según su orden manual.
- ❌ **Agrupar / sub-agrupar** en tabla (secciones plegables) — Kanban ya agrupa.
- ❌ **Visibilidad de propiedades** por vista (mostrar/ocultar columnas con 👁️).
- ❌ **Fila de cálculos** por columna (Suma/Media/Contar/Min/Max…) y subtotales por grupo.
- ❌ **Congelar columnas**, ajuste de ancho persistente, wrap por columna.
- ❌ **Color condicional** de fila/propiedad por reglas.
- ❌ **Card size / card preview** (portada/contenido/imagen) en Kanban y Galería.
- ❌ Abrir página como **side-peek / center-peek / full page** (panel lateral de registro).

### 1.4 Relaciones/Rollups/Fórmulas
- 🟡 Relación: falta **bidireccional** ("Show on [BD]"), límite 1/∞, self-relation.
- 🟡 Rollup: faltan cálculos de fecha (earliest/latest/range) y % checked.
- 🟡 Fórmulas: tenemos evaluador propio básico; Notion tiene ~90 funciones (texto/número/fecha/lista/persona) y tipos de resultado. Ampliar catálogo.

### 1.5 Otros de BD
- ❌ **Plantillas de base de datos** (botón New ▾ → plantilla; plantilla por defecto; recurrentes).
- ❌ **Sub-elementos** (jerarquía dentro de la BD) y **dependencias** (Timeline).
- ❌ **Bloquear base de datos** (esquema).
- ❌ **Bases de datos en línea (inline)** dentro de una página + **vistas enlazadas** (linked database).
- ❌ Búsqueda interna de la BD (lupa).
- ❌ Comentarios en filas/propiedades.

---

## 2. EDITOR Y BLOQUES

BlockNote ya cubre bastantes bloques básicos. Gap vs Notion:

### 2.1 Bloques
- ✅ (BlockNote): párrafo, H1-H3, listas (viñeta/numerada/to-do), cita, código, imagen, tabla simple, toggle.
- 🟡 Callout, divisor, ecuación (según config de BlockNote — verificar/activar).
- ❌ **Subpágina embebida** / link-to-page como bloque, **columnas/layout** (2-5 col con drag), **tabla de contenidos** (`/toc`), **breadcrumb**, **sync block** (bloque sincronizado), **toggle heading**, **botón** (acciones), **bookmark web** (tarjeta OpenGraph), **embeds** (Google Maps, Figma, PDF, tweet, YouTube…), **vídeo/audio/archivo**.

### 2.2 Interacciones del editor
- 🟡 Menú "/" (BlockNote lo trae; revisar categorías y traducción).
- ❌ **Menciones** @persona / @página / @fecha; **comentarios en línea**; recordatorios.
- ❌ Menú contextual de bloque completo (Turn into, Move to, Copy link to block, Color, Duplicate).
- ❌ Arrastrar bloque a columnas; selección multi-bloque con acciones masivas.
- ❌ **Portada (cover)** de página + reposicionar; "Añadir portada".
- ❌ Estilo por página: tipografía (Default/Serif/Mono), texto pequeño, **ancho completo**.
- ❌ Backlinks ("N enlaces entrantes").

---

## 3. COLABORACIÓN, PERMISOS Y ORGANIZACIÓN

- ✅ Compartir espacio + roles owner/editor/viewer.
- 🟡 Permisos: Notion tiene más niveles (Full access, Can edit, Can comment, Can view, y en BD "Can edit content"/"Can create"). Falta **compartir por PÁGINA** (no solo por espacio) y herencia padre→hijo.
- ❌ **Comentarios** (página, en línea, hilos, resolver, reacciones, menciones).
- ❌ **Colaboración en tiempo real** (cursores/presencia, edición simultánea).
- ❌ **Historial de versiones** (UI de ver/restaurar; el modelo Version ya existe).
- ❌ **Buscador global** (Ctrl/Cmd+K) con recientes y filtros.
- ❌ **Bandeja de entrada / notificaciones** (menciones, cambios, asignaciones).
- ❌ **Favoritos**, páginas recientes, seguir página.
- ❌ **Publicar página en web** (pública, con opciones).
- 🟡 Sidebar: falta sección **Favoritos**, **Compartidas**, arrastrar-para-reordenar/mover páginas.
- ❌ **Papelera**: tenemos jerarquía; falta retención 30 días automática, filtros.

---

## 4. UX, NAVEGACIÓN Y DISEÑO ("sensación Notion")

- ❌ **Barra superior**: breadcrumbs, atrás/adelante, botón Compartir, 💬, historial, ⭐ favorito, menú ⋯ de página.
- ❌ **Panel de registro (peek)**: side/center/full; navegar entre registros; propiedades editables + comentarios + cuerpo.
- ❌ **Atajos de teclado** (crear página, /, formato, mover bloque, Ctrl+K, etc.).
- ❌ **Plantillas** (galería + duplicar).
- ❌ **Importar/Exportar** (Markdown, CSV, PDF, HTML).
- ❌ **API pública** (para que Dobby/crons metan datos; hay `ApiToken` en el modelo).
- 🟡 **Tema claro/oscuro**: seguimos `prefers-color-scheme`; falta selector manual.
- 🟡 **Diseño visual**: dirección correcta (minimalista, acento naranja). Afinar hacia paleta Notion: fondo `#fff`, sidebar gris cálido, texto `#37352F`, colores de bloque (10), tipografía 16px/1.5, controles en hover (⋮⋮ + `+`), radios pequeños, sombras suaves, estados vacíos discretos, microinteracciones 100-200ms.
- ❌ **Home/Inicio** personalizable, **Mis tareas** (agrega tareas asignadas).

---

## 5. HOJA DE RUTA PRIORIZADA (propuesta)

**Fase A — Rematar bases de datos (alto impacto, visible):**
1. Tipos de campo: **Estado, Multi-selección, Fecha creación/edición, ID**. (Persona y Archivos después.)
2. **Visibilidad de propiedades** por vista + **fila de cálculos** por columna.
3. **Agrupar** en tabla; **card size/preview** en Kanban/Galería.
4. **Panel de registro (peek)** lateral con propiedades + cuerpo de la fila.
5. **Vista Timeline** (con rango de fechas y, luego, dependencias).
6. Filtros avanzados AND/OR; color condicional.

**Fase B — Navegación y organización estilo Notion:**
7. **Barra superior** (breadcrumbs, favorito, menú ⋯, compartir).
8. **Buscador global** (Ctrl+K).
9. **Portada de página** + estilo por página (tipografía, ancho completo) + tema claro/oscuro manual.
10. Sidebar: **Favoritos**, **Compartidas**, arrastrar para reordenar/mover.
11. **Historial de versiones** (UI sobre el modelo existente).

**Fase C — Colaboración avanzada:**
12. **Comentarios** (página + en línea + hilos).
13. **Menciones** y **bandeja de entrada** / notificaciones.
14. **Compartir por página** + herencia de permisos.
15. **Publicar página en web**.
16. **Edición en tiempo real** (cursores/presencia) — la más costosa.

**Fase D — Ecosistema:**
17. **Plantillas** (galería + plantillas de BD + por defecto).
18. **Importar/Exportar** (MD/CSV/PDF/HTML).
19. **API pública** (para Dobby/crons; token ya modelado).
20. Bloques avanzados (columnas, embeds, sync block, botón, toc).

> Nota: esto es un roadmap grande (meses de trabajo iterativo). Se avanza por incrementos desplegables, priorizando lo más visible y usado por la familia.
