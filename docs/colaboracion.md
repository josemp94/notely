# Edición simultánea (tiempo real)

Varias personas pueden escribir a la vez en la misma página, viéndose los cursores.
Está construido con **Yjs** y un servidor **Hocuspocus** propio.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `collab/server.ts` | contenedor `notiono-collab` | WebSocket: autentica, transporta cambios y guarda el estado en `Page.ydoc` |
| `src/server/collabToken.ts` | web y servidor de colaboración | firma y valida el permiso de sala (HMAC con `AUTH_SECRET`) |
| `pages.collabToken` | web | emite el permiso, tras comprobar que la página es de tu espacio |
| `pages.ensureYdoc` | web | la primera vez, convierte el contenido existente a estado Yjs |
| `useCollaboration` | navegador | pide permiso, conecta y entrega el documento al editor |

## Decisiones

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

**Todo va por `notiono.monrealperez.com`, sin subdominio.** Un nginx pequeño dentro del
propio compose (`notiono-proxy`, `nginx/notiono.conf`) escucha en el puerto **3010** —el
que el DSM ya conocía— y reparte: `/collab` al servidor de colaboración y el resto a la
web. La app y el servidor de colaboración dejan de publicar puertos al host.

1. En el DSM, la regla de proxy inverso **sigue igual** (`notiono.monrealperez.com` →
   `localhost:3010`). Solo hay que añadirle, en **Personalizar cabecera**, el botón
   **Crear → WebSocket** (mete `Upgrade` y `Connection`). Sin eso, la conexión se corta.
2. `NEXT_PUBLIC_COLLAB_URL` se incrusta **al compilar** (variable `NEXT_PUBLIC_`), por eso
   va en `args` del build de `app`. Si cambias de dominio hay que reconstruir la imagen,
   no basta con reiniciar el contenedor.
3. Desplegar con `docker compose up -d --build`.
4. Comprobación: dos navegadores en la misma página; al escribir en uno aparece en el otro
   con el cursor de la otra persona. Si no, `docker logs notiono-collab` y
   `docker logs notiono-proxy`.

Nota: el proxy fija `client_max_body_size 16m` porque las portadas se suben por ahí; con el
valor por defecto de nginx (1 MB) fallarían las imágenes grandes.
