import "server-only";
import { createClient } from "./supabase/server";
import { todasLasPaginas } from "./datos";
import { esUuid } from "./filtros";
import { rangoSemana, type EstatusPrograma, type FilaPrograma, type ResumenPrograma } from "./programa";
import type { Pilar, Rol } from "./tipos";

const COLUMNAS =
  "id, pilar, id_plan, id_equipo, fecha_programada, fecha_original, fecha_plan, estatus, id_responsable, responsable, " +
  "fecha_realizada, motivo, origen, nombre_equipo, sap_id, clave_id, categoria, id_almacen, nombre_almacen, plan, cada_dias, " +
  "anio_iso, semana_iso, vencido, a_tiempo";

export type FiltrosPrograma = { almacen?: string; responsable?: string; estatus?: EstatusPrograma[] };

/**
 * Servicios de una semana ISO (lunes a domingo) del pilar, con la RLS de quien consulta (pilar y almacenes).
 * Filtra por fecha programada (la de hoy, ya reprogramada). Semana inválida → sin filas.
 */
export async function programaSemana(pilar: Pilar, anio: number, semana: number, filtros: FiltrosPrograma = {}) {
  const rango = rangoSemana(anio, semana);
  if (!rango) return { desde: null, hasta: null, filas: [] as FilaPrograma[] };
  const supabase = await createClient();
  const { data } = await todasLasPaginas<FilaPrograma>((desde, hasta) => {
    let q = supabase.from("v_programa").select(COLUMNAS)
      .eq("pilar", pilar)
      .gte("fecha_programada", rango.desde)
      .lte("fecha_programada", rango.hasta);
    if (esUuid(filtros.almacen)) q = q.eq("id_almacen", filtros.almacen);
    if (esUuid(filtros.responsable)) q = q.eq("id_responsable", filtros.responsable);
    if (filtros.estatus?.length) q = q.in("estatus", filtros.estatus);
    return q.order("fecha_programada").order("nombre_almacen").order("nombre_equipo").order("id").range(desde, hasta);
  });
  return { ...rango, filas: data };
}

/**
 * Métricas del programa entre dos fechas (por la fecha del programa) y avance de la semana y el mes actuales:
 * programados a la fecha, completados, a tiempo, vencidos, reprogramados y no realizados, en total, por almacén y
 * por responsable. Los porcentajes salen con cumplimiento() / porcentaje() de lib/programa.ts.
 */
export async function resumenPrograma(pilar: Pilar, desde: string, hasta: string, filtros: Omit<FiltrosPrograma, "estatus"> = {}) {
  const { data, error } = await (await createClient()).rpc("resumen_programa", {
    p_pilar: pilar, p_desde: desde, p_hasta: hasta,
    p_almacen: esUuid(filtros.almacen) ? filtros.almacen : null,
    p_responsable: esUuid(filtros.responsable) ? filtros.responsable : null,
  });
  if (error || !data) return null;
  return data as ResumenPrograma;
}

/** A quién se le puede asignar un servicio del pilar: técnicos y supervisores activos con ese pilar. */
export async function responsablesPrograma(pilar: Pilar) {
  const { data } = await (await createClient())
    .from("usuarios_perfiles")
    .select("id, nombre, rol")
    .in("rol", ["tecnico", "supervisor"])
    .eq("activo", true)
    .contains("pilares", [pilar])
    .order("nombre");
  return (data ?? []) as { id: string; nombre: string; rol: Extract<Rol, "tecnico" | "supervisor"> }[];
}
