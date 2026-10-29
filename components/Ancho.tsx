"use client";

import { usePathname } from "next/navigation";
import { conBarra } from "@/lib/navegacion";

/**
 * Las páginas con barra lateral (las del pilar y las generales: Historial, Configuración, Usuarios) usan todo
 * el ancho; el resto de la app (elegir pilar) conserva su columna centrada de 1240px.
 */
export function Ancho({ como: Etiqueta = "div", pilar, normal, children }: {
  como?: "div" | "main"; pilar: string; normal: string; children: React.ReactNode;
}) {
  const enPilar = conBarra(usePathname());
  return <Etiqueta className={enPilar ? pilar : normal}>{children}</Etiqueta>;
}

