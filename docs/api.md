# API REST (v1)

API para automatizar bases de datos (p. ej. que un asistente mantenga finanzas o tareas).

## Autenticación

Crea un token en **Ajustes → API** (se muestra en claro una sola vez). Cada token está
scopeado a un workspace: la API solo ve/modifica datos de ese espacio.

Todas las llamadas llevan la cabecera:

```
Authorization: Bearer ntn_…
```

Errores: JSON `{ "error": "…" }` con código 400 (cuerpo inválido), 401 (token inválido)
o 404 (no existe / no es de tu workspace).

## Endpoints

### Listar bases de datos

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/databases
# → [{ "id": "…", "title": "Finanzas", "icon": "💶" }]
```

### Leer una base de datos (campos + registros)

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/databases/<id>
# → { "id", "title", "icon", "fields": [{ "id", "name", "type" }], "records": [{ "id", "cells", "parentId" }] }
```

Las `cells` son un objeto `{ fieldId: valor }`; usa los `fields` para mapear nombres.

### Crear un registro

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "cells": { "<fieldId>": "Compra super", "<fieldId2>": 42.5 }, "parentId": null }' \
  http://localhost:3000/api/v1/databases/<id>/records
# → 201 { "id", "cells", "parentId", "createdAt" }
```

`parentId` (opcional) crea un sub-elemento de otro registro de la misma base de datos.

### Actualizar celdas (merge)

```bash
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "cells": { "<fieldId>": "pagado" } }' \
  http://localhost:3000/api/v1/records/<recordId>
```

Solo cambia las celdas incluidas; `null` o `""` borra la celda.

### Borrar un registro

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/records/<recordId>
# → { "ok": true }  (borra también sus sub-elementos)
```
