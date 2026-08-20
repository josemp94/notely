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


---

## Avisos salientes (webhooks)

En **Ajustes → Avisos salientes** (solo el propietario del espacio) puedes registrar una URL.
Notiono enviará un `POST` cada vez que se cree, edite o borre una fila de cualquier base de
datos del espacio.

Cuerpo:

```json
{
  "event": "record.created",
  "workspaceId": "cl…",
  "at": "2026-08-19T18:20:00.000Z",
  "data": { "recordId": "cl…", "collectionId": "cl…", "cells": { "…": "…" } }
}
```

Eventos: `record.created`, `record.updated` (incluye `fieldId`), `record.deleted`,
`page.created` y `page.published` (incluye la ruta pública).

Cabeceras:

| Cabecera | Contenido |
|---|---|
| `X-Notiono-Event` | nombre del evento |
| `X-Notiono-Signature` | `HMAC-SHA256(secreto, cuerpo)` en hexadecimal |

Comprobar la firma en Node:

```js
const esperado = crypto.createHmac("sha256", SECRETO).update(cuerpoCrudo).digest("hex");
const valido = esperado === req.headers["x-notiono-signature"];
```

El secreto se muestra **una sola vez** al crear el aviso.

Si tu servicio no responde o falla por su lado (5xx), Notiono reintenta **tres veces**
(1 s, 5 s y 25 s). Si el destino rechaza la petición (4xx) no insiste, porque reintentarlo
daría el mismo resultado. En Ajustes se ve el código del último intento (`0` = no respondió).
