# Edición simultánea (tiempo real)

Varias personas pueden escribir a la vez en la misma página, viéndose los cursores.
Está construido con **Yjs** y un servidor **Hocuspocus** propio.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `server.mjs` | contenedor `notiono-app` | servidor propio: sirve la web y, en el mismo puerto, el WebSocket bajo `/collab` |
| `collab/hocuspocus.ts` | dentro del mismo proceso | autentica la sala, transporta los cambios y guarda el estado en `Page.ydoc` |
| `src/server/collabToken.ts` | web y servidor de colaboración | firma y valida el permiso de sala (HMAC con `AUTH_SECRET`) |
| `pages.collabToken` | web | emite el permiso, tras comprobar que la página es de tu espacio |
| `pages.ensureYdoc` | web | la primera vez, convierte el contenido existente a estado Yjs |
| `useCollaboration` | navegador | pide permiso, conecta y entrega el documento al editor |

## Decisiones

- **Todo en el mismo dominio y el mismo puerto.** El proxy inverso de Synology solo
  enruta por **host y puerto**: no admite rutas. Para servir `notiono.monrealperez.com/collab`
  sin subdominio y sin meter otro proxy, el WebSocket lo atiende el propio servidor de la
  app (`server.mjs`), que además sirve Next. Eso obliga a renunciar al modo `standalone`
  de Next, que según su documentación es incompatible con un servidor propio.
- **Un solo proceso**: no hay contenedor aparte para la colaboración. Si algún día se
  quisieran varias réplicas de la app habría que sacarlo fuera, porque cada proceso
  tendría su propia copia del documento en memoria.
- **El servidor de colaboración no sabe de BlockNote.** Solo guarda el estado Yjs. La
  versión legible (`Page.content`), que usan la búsqueda, la publicación, el export y
  las versiones, la sigue escribiendo el editor del navegador con su autosave. Así el
  servicio es pequeño y el esquema de bloques vive en un solo sitio.
- **Permiso por token firmado, no por cookie.** El servidor de colaboración está en otro
  subdominio y las cookies no cruzan de uno a otro. El token dura una hora, solo sirve
  para **esa** página y el servidor vuelve a comprobar la pertenencia al espacio en cada
  conexión (por si a alguien se le retiró el acceso).
- **`AUTH_SECRET` debe ser el mismo** en la app y en el servicio de colaboración: con él se
  firman y validan los permisos. Si no coinciden, nadie puede entrar a editar.
- **Es opcional**: sin `NEXT_PUBLIC_COLLAB_URL`, el editor funciona como siempre.
- Los invitados de solo lectura (`viewer`) se conectan y ven los cambios en vivo, pero el
  servidor rechaza sus escrituras.

## Puesta en marcha en el NAS

**Todo va por `notiono.monrealperez.com`, sin subdominio y sin piezas nuevas.** El contenedor
de siempre (`notiono-app`, puerto 3010) sirve la web y, en el mismo puerto, el WebSocket bajo
`/collab`: el proxy inverso de Synology solo enruta por host y puerto, no admite rutas, así que
separarlo obligaría a un subdominio o a meter otro proxy.

1. En el DSM, la regla de proxy inverso **sigue igual** (`notiono.monrealperez.com` →
   `localhost:3010`). Solo hay que añadirle, en **Personalizar cabecera**, el botón
   **Crear → WebSocket** (mete `Upgrade` y `Connection`). Sin eso, la conexión se corta.
   *(Hecho por Jose el 20-ago-2026.)*
2. `NEXT_PUBLIC_COLLAB_URL` se incrusta **al compilar** (variable `NEXT_PUBLIC_`), por eso va
   en `args` del build de `app`. Si cambias de dominio hay que reconstruir la imagen, no basta
   con reiniciar el contenedor.
3. Desplegar con `docker compose up -d --build`.
4. Comprobación: dos navegadores en la misma página; al escribir en uno aparece en el otro con
   el cursor de la otra persona. Si no, `docker logs notiono-app`.
5. Desde fuera: `curl -s https://notiono.monrealperez.com/api/health` debe traer el campo
   `collab` con la dirección del WebSocket. Si viene `null`, el build no recibió la variable y
   la colaboración está apagada (también se ve en **Ajustes → Estado**).

## Comprobado en producción (20-ago-2026)

- El proxy del DSM **pasa el upgrade** en `/collab` y aguanta la conexión abierta con actividad
  (pings correctos durante minutos); otras rutas no llegan al servidor de colaboración.
- Una conexión que **no se autentica** la cierra el servidor sola (60 s si está muda, ~120 s si
  solo hace ping): no se acumulan conexiones abiertas.
- **Un permiso inválido no sincroniza nada**, pero el servidor corta en silencio, sin mensaje de
  error. Por eso el editor muestra el aviso «Sin sincronizar» y el permiso se renueva en cada
  reconexión (dura una hora).
