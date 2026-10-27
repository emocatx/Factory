"use client";

import { usePathname } from "next/navigation";

/**
 * Las páginas de pilar (/p/…) usan todo el ancho, con la barra lateral de secciones;
 * el resto de la app conserva su columna centrada de 1240px.
 */
export function Ancho({ como: Etiqueta = "div", pilar, normal, children }: {
  como?: "div" | "main"; pilar: string; normal: string; children: React.ReactNode;
}) {
  const enPilar = usePathname().startsWith("/p/");
  return <Etiqueta className={enPilar ? pilar : normal}>{children}</Etiqueta>;
}

/** Lo que solo se muestra fuera de las páginas de pilar (ahí va en la barra lateral). */
export function FueraDePilar({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith("/p/") ? null : <>{children}</>;
}
