"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { conContexto } from "@/lib/filtros";
import { Encabezado, Segmentado } from "./ui";
import type { Pilar } from "@/lib/tipos";

/**
 * Encabezado de la sección Órdenes con el selector Abiertas | Cerradas.
 * Vive en el layout de la sección: no se vuelve a pedir al cambiar de vista y el selector
 * se marca al instante mientras la lista nueva carga (ver (ordenes)/loading.tsx).
 */
export function EncabezadoOrdenes({ pilar, operaciones }: { pilar: Pilar; operaciones: boolean }) {
  const ruta = usePathname();
  const sp = useSearchParams();
  const actual = ruta.endsWith("/cerradas") ? "cerradas" : "abiertas";
  const vistas = [
    { v: "abiertas", t: "Abiertas", href: `/p/${pilar}/ordenes` },
    { v: "cerradas", t: "Cerradas", href: `/p/${pilar}/cerradas` },
  ] as const;
  return (
    // El resumen de cada vista hace de subtítulo en la fila de filtros de la página (BarraFiltros).
    <Encabezado titulo={operaciones ? "Seguimiento" : "Órdenes"}>
      <Segmentado etiqueta="Vista de órdenes" actual={actual} opciones={vistas.map((x) => ({ v: x.v, t: x.t, href: conContexto(x.href, sp) }))} />
    </Encabezado>
  );
}
