import "server-only";
import { createClient } from "./supabase/server";
import type { Almacen, Equipo, Linea, Modo, Origen, Perfil, Pilar } from "./tipos";

/** Catálogos que casi todas las pantallas de un pilar necesitan. */
export async function catalogosPilar(pilar: Pilar) {
  const supabase = await createClient();
  const [a, l, e, o, m] = await Promise.all([
    supabase.from("almacenes").select("id_almacen, nombre_almacen, activo").eq("activo", true).order("nombre_almacen"),
    pilar === "dorsales"
      ? supabase.from("lineas_dorsales").select("id_linea, nombre_linea, activo").eq("activo", true).order("nombre_linea")
      : Promise.resolve({ data: [] as Linea[] }),
    supabase
      .from("equipos")
      .select("id_equipo, id_almacen, id_linea, sap_id, clave_id, nombre_equipo, tipo_pilar, estatus")
      .eq("tipo_pilar", pilar)
      .neq("estatus", "baja")
      .order("nombre_equipo"),
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
