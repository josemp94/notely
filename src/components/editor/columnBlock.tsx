"use client";

import { createReactBlockSpec } from "@blocknote/react";

/**
 * Columnas del editor, a mano.
 *
 * BlockNote solo trae las columnas en su paquete de pago (`xl-multi-column`), pero
 * **su hoja de estilos ya define** `.bn-block-column-list` y `.bn-block-column`: lo
 * único que falta son los dos bloques. Se llaman igual que los suyos (`columnList`
 * y `column`) para que el documento siga siendo compatible si algún día se compra.
 *
 * Los bloques de dentro NO los pinta este bloque: BlockNote saca los hijos en un
 * `.bn-block-group` hermano del contenido. Por eso el reparto del ancho está en
 * `globals.css`, colgando del tipo de bloque, y no aquí.
 */
export const ColumnListBlock = createReactBlockSpec(
  { type: "columnList", propSchema: {}, content: "none" },
  {
    // El contenido propio no pinta nada: todo lo visible son los hijos.
    render: () => <div className="bn-block-column-list" />,
    toExternalHTML: () => <div />,
  },
);

export const ColumnBlock = createReactBlockSpec(
  { type: "column", propSchema: {}, content: "none" },
  {
    render: () => <div className="bn-block-column" />,
    toExternalHTML: () => <div />,
  },
);

/** Una columna vacía, lista para escribir. */
export const emptyColumn = () => ({ type: "column" as const, children: [{ type: "paragraph" as const }] });
