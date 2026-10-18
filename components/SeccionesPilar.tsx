"use client";

import { usePathname } from "next/navigation";
import { TiraNav } from "./TiraNav";
import { IconoSeccion } from "./IconosSeccion";

/** Tira de secciones del pilar (Órdenes abiertas, Resumen…) con icono, como la fila de productos. */
export function SeccionesPilar({ items, abiertas }: { items: { href: string; texto: string }[]; abiertas: number }) {
  const ruta = usePathname();
  return (
    <TiraNav
      etiquetaNav="Secciones del pilar"
      items={items.map((i) => {
        const seg = i.href.split("/").pop() ?? "";
        const clave = i.texto === "Seguimiento" ? "seguimiento" : seg;
        return {
          href: i.href,
          texto: i.texto,
          visual: <IconoSeccion clave={clave} />,
          etiqueta: seg === "ordenes" && abiertas > 0 ? `${abiertas} abierta${abiertas === 1 ? "" : "s"}` : undefined,
          activo: ruta === i.href || ruta.startsWith(i.href + "/"),
        };
      })}
    />
  );
}
