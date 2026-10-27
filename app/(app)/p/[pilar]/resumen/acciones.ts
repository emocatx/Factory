"use server";

import { sesionDePilar } from "@/lib/sesion";
import { indicadoresDe } from "@/lib/home";
import { PERIODOS_HOME } from "@/lib/homeComun";
import { esUuid } from "@/lib/filtros";

/** Indicadores oficiales de un almacén que no está en la escena (se piden al elegirlo en el filtro). */
export async function indicadoresAlmacen(pilar: string, idAlmacen: string, periodo: string) {
  const { pilar: p, perfil } = await sesionDePilar(pilar);
  if (perfil.rol === "operaciones" || !esUuid(idAlmacen)) return null;
  const dias = (PERIODOS_HOME.find((x) => x.v === periodo) ?? PERIODOS_HOME[2]).dias;
  return indicadoresDe(p, new Date(Date.now() - dias * 86_400_000).toISOString(), idAlmacen);
}
