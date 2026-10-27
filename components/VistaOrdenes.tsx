"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { conContexto } from "@/lib/filtros";
import { Encabezado } from "./ui";
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
      <nav aria-label="Vista de órdenes" className="inline-flex rounded-full bg-panel-2 p-1">
        {vistas.map((x) => (
          <Link key={x.v} href={conContexto(x.href, sp)} aria-current={x.v === actual ? "page" : undefined}
            className={`flex min-h-10 items-center rounded-full px-4 text-[15px] ${x.v === actual ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>
            {x.t}
          </Link>
        ))}
      </nav>
    </Encabezado>
  );
}
