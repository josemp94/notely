# El móvil

Notiono se usa en el móvil tanto como en el ordenador (y desde el APK, ver
`android.md`, es *solo* móvil). Esto recoge lo que hay que tener en cuenta y cómo
comprobarlo sin desplegar.

## Lo que se da por hecho en escritorio y en el móvil no existe

**No hay «pasar el ratón por encima».** Todo lo que estuviera escondido detrás de un
hover era, en el móvil, sencillamente inalcanzable: abrir la ficha de una fila, el
menú «···» de una columna, el «+» de crear una subpágina, las acciones de un
comentario. Se resuelve con la clase **`.al-pasar`**: escondido al ratón, visible en
pantalla táctil. Lo que de verdad necesita ratón —arrastrar filas, el tirador de
ancho de columna— se queda escondido a propósito: enseñarlo sería prometer algo que
con el dedo no funciona.

**El dedo no acierta en 28 px.** `.toque` deja 40×40 en táctil sin tocar el
escritorio; `.toque-estrecho` solo el alto, para lo que va en fila y no puede
ensancharse. Los menús colgantes se agrandan solos: el panel lleva `data-menu`.

**La pantalla mide 390 px, no 1440.** Un H1 de 3em son 48 px ahí: los encabezados del
editor se rebajan en móvil cambiando la variable `--level` de BlockNote. Y cualquier
rejilla de dos columnas necesita `min-w-0` en la columna elástica, o un valor largo
—una URL— la estira y desplaza el panel entero de lado.

## La tabla

El margen izquierdo de cada fila (arrastrar, abrir ficha) mide **`GUTTER_WIDTH`**
(`src/lib/cellText.ts`) y ese ancho va **forzado** en todas sus celdas: cabecera,
filas, subtotales de grupo y pie. No es cosmético: es el punto del que cuelgan las
columnas congeladas (`frozenOffsets`). Cuando no cuadraba —`w-14` pedía 56 px y el
navegador encogía la columna a 35— quedaba una rendija de 21 px por la que se veía
pasar el resto de la tabla al desplazar en horizontal. Si tocas ese margen, cuadra
las dos cosas.

Lo que sigue sin estar: **la cabecera no se queda fija al bajar** por la tabla. El
contenedor de la tabla es `overflow-x-auto`, o sea que también es contenedor de
scroll vertical, y un `sticky top` ahí no se pega a nada. Arreglarlo pide que la
tabla scrollee por dentro en vertical, que en táctil trae sus propios problemas.

## Cómo se comprueba sin base de datos ni despliegue

Con un banco de pruebas: se empaqueta el componente real con esbuild, con `trpc`
sustituido por datos de mentira, se compila `globals.css` con postcss y se abre a
390×844 con Playwright. Así se ven —y se miden— cosas que a ojo no se ven: que el
hueco entre el margen y la primera congelada es de 0 px, que el panel de una ficha
mide 390 y no 422, que un input recorta con puntos suspensivos.

Medir, no mirar: `getBoundingClientRect()` sobre las celdas dice la verdad; una
captura reducida, no. Lo que parecían restos de contenido colándose por el margen
resultaron ser, con la lupa puesta, los bordes de fila.
