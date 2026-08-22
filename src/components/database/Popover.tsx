"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Menú colgante de un botón (filtros, opciones de columna, tipos de vista…).
 *
 * Se pinta FUERA del árbol de la página, pegado a su botón por coordenadas. Antes
 * colgaba del botón con posición absoluta y, dentro de la tabla —que se desplaza en
 * horizontal—, el menú quedaba recortado: el de «añadir columna» se veía a medias.
 * Al sacarlo del árbol ya no hay caja que lo recorte, y de paso se le pone tope de
 * altura y se le impide salirse de la pantalla.
 *
 * `className` sigue diciendo el ancho y hacia qué lado alinea (`right-0` = por la
 * derecha, que es como lo piden casi todos los botones de la barra).
 */
export function Popover({
  children,
  onClose,
  className = "right-0 w-80 p-3",
  at,
  anchorRef,
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  /** Punto exacto donde abrirlo (un clic derecho). Si no, cuelga de su botón. */
  at?: { x: number; y: number };
  /**
   * Elemento del que colgar el menú, pasado a mano. Es más fiable que deducirlo
   * por `parentElement` del ancla: ese `<span>` oculto podía no tener padre
   * resuelto en el instante del cálculo (montaje con portal), `colocar()` hacía
   * return y el panel se quedaba en la esquina (-9999). Con una ref al contenedor
   * de la celda —siempre montado mientras el menú está abierto— no falla.
   */
  anchorRef?: { readonly current: HTMLElement | null };
}) {
  const ancla = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const porLaDerecha = className.includes("right-0");

  useLayoutEffect(() => {
    const colocar = () => {
      const caja = panel.current?.getBoundingClientRect();
      // Abierto en un punto (clic derecho): la caja es ese punto, sin tamaño.
      // Si no, del ancla explícita (fiable) o, en su defecto, del padre del marcador.
      const anclaEl = anchorRef?.current ?? ancla.current?.parentElement;
      const boton = at
        ? ({ left: at.x, right: at.x, top: at.y, bottom: at.y } as DOMRect)
        : anclaEl?.getBoundingClientRect();
      if (!boton) return;
      const ancho = caja?.width || 320;
      const alto = caja?.height || 240;
      const margen = 8;
      const izq = porLaDerecha && !at ? boton.right - ancho : boton.left;
      // Debajo del botón, que es donde se espera. Solo se va arriba si no cabe
      // debajo Y arriba hay más sitio: subirlo a un hueco aún más pequeño sería
      // cambiar un menú apretado por otro peor.
      const huecoAbajo = window.innerHeight - boton.bottom - margen;
      const huecoArriba = boton.top - margen;
      const debajo = alto <= huecoAbajo || huecoAbajo >= huecoArriba;
      setPos({
        top: debajo ? boton.bottom + 4 : Math.max(margen, boton.top - Math.min(alto, huecoArriba) - 4),
        left: Math.max(margen, Math.min(izq, window.innerWidth - ancho - margen)),
        maxHeight: debajo ? huecoAbajo : huecoArriba,
      });
    };
    colocar();
    // Si la página se mueve bajo el menú, el menú se mueve con ella.
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => {
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
    };
  }, [porLaDerecha, at, anchorRef]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as globalThis.Node;
      if (!panel.current || panel.current.contains(t)) return;
      // El botón del que cuelga el menú hace su propio toggle en el click: si
      // cerráramos aquí en el mousedown, ese click lo reabriría al instante.
      if (!at && (anchorRef?.current ?? ancla.current?.parentElement)?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, at, anchorRef]);

  return (
    <>
      <span ref={ancla} className="hidden" />
      {createPortal(
        <div
          ref={panel}
          data-menu=""
          // El tope de ancho es para el móvil: un menú de 320 px no cabe en una
          // pantalla de 320, y prefiero que se estreche a que se salga.
          style={{
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            maxHeight: pos?.maxHeight,
            maxWidth: "calc(100vw - 16px)",
          }}
          className={`fixed z-[60] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl ${className.replace(/\b(right|left)-0\b/g, "")}`}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
