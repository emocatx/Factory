import "server-only";
import { createClient } from "./supabase/server";
import type { Almacen, Equipo, Linea, Modo, Origen, Perfil, Pilar } from "./tipos";

/** Supabase entrega como máximo 1000 filas por consulta: junta todas las páginas. */
export async function todasLasPaginas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  tam = 1000,
): Promise<{ data: T[] }> {
  const todo: T[] = [];
  for (let desde = 0; desde < 100_000; desde += tam) {
    const { data, error } = await consulta(desde, desde + tam - 1);
    if (error || !data) break;
    todo.push(...(data as T[]));
    if (data.length < tam) break;
  }
  return { data: todo };
}

/**
 * Catálogos que casi todas las pantallas de un pilar necesitan.
 * `equipos: false` omite la lista de equipos (cientos de filas) en pantallas que no la usan.
 */
export async function catalogosPilar(pilar: Pilar, { equipos = true }: { equipos?: boolean } = {}) {
  const supabase = await createClient();
  const [a, l, e, o, m] = await Promise.all([
    supabase.from("almacenes").select("id_almacen, nombre_almacen, activo").eq("activo", true).order("nombre_almacen"),
    pilar === "dorsales"
      ? supabase.from("lineas_dorsales").select("id_linea, nombre_linea, activo").eq("activo", true).order("nombre_linea")
      : Promise.resolve({ data: [] as Linea[] }),
    !equipos ? Promise.resolve({ data: [] as Equipo[] }) : todasLasPaginas<Equipo>((desde, hasta) =>
      supabase
        .from("equipos")
        .select("id_equipo, id_almacen, id_linea, sap_id, clave_id, nombre_equipo, tipo_pilar, estatus")
        .eq("tipo_pilar", pilar)
        .neq("estatus", "baja")
        .order("nombre_equipo")
        .order("id_equipo")
        .range(desde, hasta)),
    supabase.from("origenes_falla").select("id_origen, nombre, pilares, orden, activo").eq("activo", true).order("orden"),
    supabase.from("modos_falla").select("id_modo, nombre, pilares, orden, activo").eq("activo", true).order("orden"),
  ]);
  const origenes = ((o.data ?? []) as Origen[]).filter((x) => !x.pilares || x.pilares.includes(pilar));
  const modos = ((m.data ?? []) as Modo[]).filter((x) => !x.pilares || x.pilares.includes(pilar));
  return {
    almacenes: (a.data ?? []) as Almacen[],
    lineas: (l.data ?? []) as Linea[],
    equipos: (e.data ?? []) as Equipo[],
    origenes,
    modos,
  };
}

/** Personas que pueden atender órdenes de este pilar (para asignar). */
export async function tecnicosPilar(pilar: Pilar) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("usuarios_perfiles")
    .select("id, tenant_id, nombre, correo, rol, pilares, activo")
    .in("rol", ["admin", "supervisor", "tecnico"])
    .eq("activo", true)
    .order("nombre");
  return ((data ?? []) as Perfil[]).filter((p) => p.rol === "admin" || p.pilares.includes(pilar));
}
