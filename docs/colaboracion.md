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

1. En `docker-compose.yml` ya está el servicio `collab` (puerto host **3011**).
2. `NEXT_PUBLIC_COLLAB_URL` se incrusta **al compilar** (es una variable `NEXT_PUBLIC_`),
   así que va como `args` del build de `app`, no como variable de entorno del contenedor.
   Si cambias el dominio, hay que reconstruir la imagen, no basta con reiniciar.
3. En **DSM → Portal de inicio de sesión → Avanzado → Proxy inverso**, crear una regla:
   - Origen: `HTTPS` · `collab.notiono.monrealperez.com` · puerto `443`
   - Destino: `HTTP` · `localhost` · puerto `3011`
   - En **Personalizar cabecera**, botón **Crear → WebSocket** (añade `Upgrade` y `Connection`).
4. El subdominio debe resolver (registro DNS/Cloudflare igual que `notiono`).
5. Comprobación: dos navegadores en la misma página; al escribir en uno aparece en el otro
   con el cursor de la otra persona. Si no, mirar `docker logs notiono-collab`.
