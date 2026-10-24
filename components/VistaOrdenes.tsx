"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Encabezado } from "./ui";
import type { Pilar } from "@/lib/tipos";

/**
 * Encabezado de la sección Órdenes con el selector Abiertas | Cerradas.
 * Vive en el layout de la sección: no se vuelve a pedir al cambiar de vista y el selector
 * se marca al instante mientras la lista nueva carga (ver (ordenes)/loading.tsx).
 */
export function EncabezadoOrdenes({ pilar, operaciones }: { pilar: Pilar; operaciones: boolean }) {
  const ruta = usePathname();
  const actual = ruta.endsWith("/cerradas") ? "cerradas" : "abiertas";
  const vistas = [
    { v: "abiertas", t: "Abiertas", href: `/p/${pilar}/ordenes` },
    { v: "cerradas", t: "Cerradas", href: `/p/${pilar}/cerradas` },
  ] as const;
  return (
    <Encabezado
      titulo={operaciones ? "Seguimiento" : "Órdenes"}
      sub={actual === "cerradas"
        ? "Solicitudes concluidas o canceladas, para validar el cierre y el historial de atención."
        : operaciones
          ? "Tus solicitudes y las de tu área mientras mantenimiento las atiende."
          : "Prioriza, asigna e inicia la atención; concluye cuando el activo vuelva a operar."}
    >
      <nav aria-label="Vista de órdenes" className="inline-flex rounded-full bg-panel-2 p-1">
        {vistas.map((x) => (
          <Link key={x.v} href={x.href} aria-current={x.v === actual ? "page" : undefined}
            className={`flex min-h-10 items-center rounded-full px-4 text-[15px] ${x.v === actual ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>
            {x.t}
          </Link>
        ))}
      </nav>
    </Encabezado>
  );
}
