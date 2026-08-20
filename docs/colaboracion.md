# Edición simultánea (tiempo real)

Varias personas pueden escribir a la vez en la misma página, viéndose los cursores.
Está construido con **Yjs** y un servidor **Hocuspocus** propio.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| `server.mjs` | contenedor `notiono-app` | servidor propio: sirve la web y, en el mismo puerto, el WebSocket bajo `/collab` |
| `collab/hocuspocus.ts` | dentro del mismo proceso | autentica la sala, transporta los cambios y guarda el estado en `Page.ydoc` |
| `attachConnection` | ídem | engancha cada WebSocket aceptado al servidor de colaboración |
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
- **Permiso por token firmado, no por cookie.** El WebSocket no pasa por el resto de la
  app, así que aquí no hay sesión que leer: el permiso viaja dentro del protocolo de
  Hocuspocus. Dura una hora, solo sirve para **esa** página, se renueva solo en cada
  reconexión y el servidor vuelve a comprobar la pertenencia al espacio cada vez (por si
  a alguien se le retiró el acceso).
- **`AUTH_SECRET` debe ser el mismo** en la app y en el servicio de colaboración: con él se
  firman y validan los permisos. Si no coinciden, nadie puede entrar a editar.
- **Es opcional**: sin `NEXT_PUBLIC_COLLAB_URL`, el editor funciona como siempre.
- Los invitados de solo lectura (`viewer`) se conectan y ven los cambios en vivo, pero el
  servidor rechaza sus escrituras.
- **El documento lo estrena el navegador, no el servidor.** Convertir los bloques
  existentes a estado Yjs necesita el esquema del editor, hecho de componentes de React,
  y en el servidor de Next `react` se resuelve en su versión de servidor, sin
  `createContext`: ahí revienta. El servidor solo decide **quién** siembra, reservando el
  documento vacío de forma atómica; si no, dos pestañas a la vez duplicarían el contenido.
- **Hocuspocus 4 no escucha el socket.** Es agnóstico del transporte: `handleConnection`
  registra la conexión, pero hay que entregarle cada mensaje y avisarle del cierre. Si se
  olvida, no hay ningún error: la conexión se abre y no se sincroniza nada. Por eso el
  enganche está en un solo sitio (`attachConnection`) y `npm run check` lo comprueba
  levantando un servidor con dos clientes.

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

- El proxy del DSM **pasa el upgrade** en `/collab` y aguanta la conexión abierta con
  actividad (pings correctos durante minutos); otras rutas no llegan al servidor.
- Que el upgrade pase **no prueba que se sincronice**: durante un tiempo se dio por buena
  la colaboración cuando en realidad el servidor no contestaba a nada (ver el arreglo del
  enganche). La prueba que vale es la de dos clientes intercambiando un cambio, que es la
  que hace `npm run check`, y la de dos navegadores en la misma página.
- **Comprobado ya en producción con dos pestañas**: lo escrito en una aparece en la otra
  con la etiqueta del cursor, en los dos sentidos; el documento se estrena con el contenido
  que ya tenía la página, sobrevive a recargar (queda en `Page.ydoc`) y la copia legible
  (`Page.content`) se sigue guardando con los cambios de ambas, que es de lo que viven la
  búsqueda, la publicación y el export.
- `pages.ensureYdoc` devolvía 500 y el editor se quedaba sin colaboración **en silencio**;
  ahora eso se ve en la propia página («Sin sincronizar»).
- Diagnóstico desde fuera: `curl -s https://notiono.monrealperez.com/api/health` debe traer
  el campo `collab` con la dirección del WebSocket. Si viene `null`, el build no recibió la
  variable (también se ve en **Ajustes → Estado**).
