import "server-only";
import { createClient } from "./supabase/server";
import { todasLasPaginas, type ErrorConsulta } from "./datos";
import { esUuid } from "./filtros";
import { hoyMx } from "./planes";
import {
  COLUMNAS_LISTA, ESTATUS_ABIERTOS, rangoSemana, semanaDe,
  type EstatusPrograma, type FilaLista, type ResumenPrograma,
} from "./programa";
import type { Pilar, Rol } from "./tipos";

const COLUMNAS = COLUMNAS_LISTA.join(", ");

/** responsable: id de la persona o "sin" (sin asignar). */
export type FiltrosPrograma = { almacen?: string; responsable?: string; estatus?: EstatusPrograma[] };

/** Por qué no llegaron los datos: falta aplicar la migración del programa, o la consulta falló. */
export type FallaPrograma = "migracion" | "consulta";

/**
 * La tabla, la vista o la función no existen todavía (migración sin aplicar): PostgREST responde PGRST205 (tabla o
 * vista) o PGRST202 (función); Postgres, 42P01 / 42883.
 */
export const faltaMigracion = (e: ErrorConsulta | null | undefined) =>
  !!e && ["PGRST205", "PGRST202", "42P01", "42883"].includes(e.code ?? "");

const falla = (e: ErrorConsulta | null): FallaPrograma | null => (!e ? null : faltaMigracion(e) ? "migracion" : "consulta");

/** Filtros comunes de la lista (almacén y responsable, con "sin" = sin asignar). */
function filtrar<Q extends { eq(c: string, v: string): Q; is(c: string, v: null): Q }>(q: Q, filtros: FiltrosPrograma): Q {
  if (esUuid(filtros.almacen)) q = q.eq("id_almacen", filtros.almacen);
  if (filtros.responsable === "sin") q = q.is("id_responsable", null);
  else if (esUuid(filtros.responsable)) q = q.eq("id_responsable", filtros.responsable);
  return q;
}

/**
 * Servicios de una semana ISO (lunes a domingo) del pilar, con la RLS de quien consulta (pilar y almacenes).
 * Filtra por fecha programada (la de hoy, ya reprogramada). Semana inválida → sin filas.
 */
export async function programaSemana(pilar: Pilar, anio: number, semana: number, filtros: FiltrosPrograma = {}) {
  const rango = rangoSemana(anio, semana);
  if (!rango) return { desde: null, hasta: null, filas: [] as FilaLista[], error: null };
  const supabase = await createClient();
  const { data, error } = await todasLasPaginas<FilaLista>((desde, hasta) => {
    let q = filtrar(
      supabase.from("v_programa").select(COLUMNAS).eq("pilar", pilar).gte("fecha_programada", rango.desde).lte("fecha_programada", rango.hasta),
      filtros,
    );
    if (filtros.estatus?.length) q = q.in("estatus", filtros.estatus);
    return q.order("fecha_programada").order("nombre_almacen").order("nombre_equipo").order("id").range(desde, hasta);
  });
  return { ...rango, filas: error ? [] : data, error: falla(error) };
}

/**
 * Vencidos: abiertos con fecha programada de una semana anterior a la actual, de cualquier año (los mismos que
 * cuenta resumen_programa). Los más viejos primero; `total` es cuántos hay aunque la lista se corte en `limite`.
 */
export async function programaVencidos(pilar: Pilar, filtros: Omit<FiltrosPrograma, "estatus"> = {}, limite = 200) {
  const tope = Math.min(Math.max(Math.trunc(limite) || 1, 1), 1000);
  const hoy = semanaDe(hoyMx());
  const lunes = rangoSemana(hoy.anio, hoy.semana)!.desde;
  const { data, error, count } = await filtrar(
    (await createClient()).from("v_programa").select(COLUMNAS, { count: "exact" })
      .eq("pilar", pilar).in("estatus", [...ESTATUS_ABIERTOS]).lt("fecha_programada", lunes),
    filtros,
  ).order("fecha_programada").order("nombre_almacen").order("nombre_equipo").order("id").limit(tope);
  if (error) return { filas: [] as FilaLista[], total: 0, error: falla(error) };
  return { filas: (data ?? []) as unknown as FilaLista[], total: count ?? 0, error: null };
}

/**
 * Métricas del programa entre dos fechas (por la fecha del programa) y avance de la semana y el mes actuales:
 * programados a la fecha, completados, a tiempo, vencidos (de cualquier año), reprogramados y no realizados, en
 * total, por almacén y por responsable. Los porcentajes salen con cumplimiento() / porcentaje() de lib/programa.ts.
 */
export async function resumenPrograma(
  pilar: Pilar, desde: string, hasta: string, filtros: Omit<FiltrosPrograma, "estatus"> = {},
): Promise<{ resumen: ResumenPrograma | null; error: FallaPrograma | null }> {
  const { data, error } = await (await createClient()).rpc("resumen_programa", {
    p_pilar: pilar, p_desde: desde, p_hasta: hasta,
    p_almacen: esUuid(filtros.almacen) ? filtros.almacen : null,
    p_responsable: esUuid(filtros.responsable) ? filtros.responsable : null,
  });
  if (error) return { resumen: null, error: falla(error) };
  if (!data) return { resumen: null, error: "consulta" };
  return { resumen: data as ResumenPrograma, error: null };
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
