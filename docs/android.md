# La app de Android

Notiono en el móvil es un **APK que por dentro es Chrome** abriendo la misma web, sin
barra de direcciones ni pestañas (una TWA: *Trusted Web Activity*). Es la forma
estándar de empaquetar una web instalable como app, y la que usan bastantes apps de
la Play Store que uno jura que son nativas.

Lo importante de entender: **el APK no lleva la aplicación dentro**. Lleva el nombre,
el icono y la dirección. Todo lo demás —el editor, las bases de datos, la edición
simultánea— sigue viviendo en el NAS. Por eso:

- **Cuando despliegas la web, la app del móvil se actualiza sola.** No hay que
  reinstalar nada ni volver a compilar el APK.
- Solo hay que rehacer el APK si cambia el **nombre, el icono, el color o el
  dominio**.
- Y por eso mismo, sin conexión al NAS la app abre lo que tuviera guardado el
  navegador, igual que la web.

## Lo que hace falta

| Pieza | Dónde | Para qué |
|---|---|---|
| `android/twa-manifest.json` | este repo | nombre, icono, colores, dominio y versión |
| `~/.bubblewrap/` | el PC | JDK 17 y SDK de Android que se descarga Bubblewrap solo (~1,5 GB) |
| `~/notiono-apk/notiono.keystore` | **fuera del repo** | la firma del APK |
| `/.well-known/assetlinks.json` | la web | dice que ese APK es de este dominio |

### El almacén de claves: guárdalo

`~/notiono-apk/notiono.keystore` es lo que firma el APK. **Si se pierde, ninguna
versión futura se podrá instalar encima de la instalada**: Android lo rechaza por
firma distinta y hay que desinstalar la app (y con ella lo que tenga guardado el
navegador dentro). No está en el repo a propósito —una clave de firma no se sube a
git— así que cópialo donde guardes las cosas que no se pueden volver a generar,
junto con su contraseña.

### El enlace entre dominio y app

Chrome le quita la barra de direcciones al APK solo si la web confirma que ese APK es
suyo. Lo confirma `/.well-known/assetlinks.json`, que compara la huella SHA-256 de la
firma. Esa huella va en la variable `ANDROID_CERT_FINGERPRINT` del contenedor
(`docker-compose.yml`), y **hasta que no se despliega con ella, la app se ve con la
barra del navegador arriba**. Funciona igual, pero canta.

Para volver a sacar la huella:

```bash
~/.bubblewrap/jdk/*/bin/keytool -list -v \
  -keystore ~/notiono-apk/notiono.keystore -alias notiono
```

## Compilar

```bash
cd ~/Projects/notiono/android
export PATH="$HOME/.npm-global/bin:$PATH"
export BUBBLEWRAP_KEYSTORE_PASSWORD='…'   # la contraseña del almacén
export BUBBLEWRAP_KEY_PASSWORD='…'        # la de la clave
bubblewrap build --skipPwaValidation
```

Deja el APK firmado en `android/app-release-signed.apk`.

## Instalarlo en el móvil

No hace falta la Play Store (eso son 25 € y una revisión, y solo sirve para
distribuirlo al público). Pásate el `.apk` al teléfono —correo, cable, lo que sea— y
ábrelo; Android pedirá permiso para instalar de esa fuente esa vez.

## Publicar una versión nueva del APK

Solo si cambia el envoltorio (nombre, icono, dominio). Sube los dos números de
`twa-manifest.json` —`appVersionCode` (entero, obligatorio subirlo) y
`appVersionName` (lo que ve el usuario)— y vuelve a compilar. Firmado con el mismo
almacén, se instala encima sin perder nada.
