import "server-only";
import { createClient } from "./supabase/server";
import { todasLasPaginas } from "./datos";
import { ESTADOS_ABIERTOS, puedeAsignar } from "./catalogos";
import { calcularHallazgos, type AbiertaH, type FallaH, type Hallazgo, type VencidoH } from "./hallazgos";
import type { Pilar, Rol } from "./tipos";

const COLUMNAS_FALLA = "id_orden, id_equipo, nombre_equipo, sap_id, serie, id_linea, nombre_linea, id_origen, nombre_origen, id_modo, nombre_modo, "
  + "estatus_orden, fecha_ingreso, fecha_cierre, tiempo_paro_horas, horas_transcurridas, id_almacen, descripcion_falla";

/**
 * Hallazgos del pilar, o de un almacén, para la persona según su rol (ver lib/hallazgos.ts). Lee con los permisos de
 * quien mira la página. Si algo falla al leer, no muestra ninguno en lugar de romper la página.
 */
export async function hallazgosDe({ pilar, rol, alcance, almacen = null }: {
  pilar: Pilar; rol: Rol; alcance: string; almacen?: string | null;
}): Promise<Hallazgo[]> {
  try {
    const supabase = await createClient();
    const ahora = Date.now();
    const hace90 = new Date(ahora - 90 * 86_400_000).toISOString();
    const [{ data: fallas }, { data: abiertas }, { data: vencidos }, { data: equipos }, { data: planes }] = await Promise.all([
      todasLasPaginas<FallaH>((a, b) => supabase.from("v_ordenes_detalle").select(COLUMNAS_FALLA)
        .eq("pilar", pilar).neq("estatus_orden", "cancelada").gte("fecha_ingreso", hace90).order("fecha_ingreso").order("id_orden").range(a, b)),
      todasLasPaginas<AbiertaH>((a, b) => supabase.from("ordenes_mantenimiento")
        .select("id_orden, id_equipo, id_almacen, estatus_orden, fecha_ingreso, fecha_asignacion, fecha_inicio, asignado_a, importada")
        .eq("pilar", pilar).in("estatus_orden", ESTADOS_ABIERTOS).order("fecha_ingreso").order("id_orden").range(a, b)),
      todasLasPaginas<VencidoH>((a, b) => supabase.from("v_plan_equipos").select("id_almacen, nombre_almacen, dias_restantes")
        .eq("pilar", pilar).eq("activo", true).not("cada_dias", "is", null).lt("dias_restantes", -7).order("id").range(a, b)),
      todasLasPaginas<{ id_equipo: string; id_almacen: string | null; categoria: string | null }>((a, b) => supabase.from("equipos")
        .select("id_equipo, id_almacen, categoria").eq("tipo_pilar", pilar).order("id_equipo").range(a, b)),
      supabase.from("planes_mantenimiento").select("nombre").eq("pilar", pilar),
    ]);

    // Un almacén: la orden es suya si la registraron ahí o si su equipo vive ahí.
    const almacenDe = new Map(equipos.map((x) => [x.id_equipo, x.id_almacen]));
    const enAlcance = (o: { id_almacen: string | null; id_equipo: string | null }) =>
      !almacen || o.id_almacen === almacen || (o.id_equipo !== null && almacenDe.get(o.id_equipo) === almacen);

    return calcularHallazgos({
      ahora,
      alcance,
      base: `/p/${pilar}`,
      almacen,
      fallas: fallas.filter(enAlcance),
      abiertas: abiertas.filter(enAlcance),
      vencidos: vencidos.filter((v) => !almacen || v.id_almacen === almacen),
      categorias: new Map(equipos.filter((x) => x.categoria).map((x) => [x.id_equipo, x.categoria as string])),
      planes: ((planes ?? []) as { nombre: string }[]).map((p) => p.nombre),
      gestiona: puedeAsignar(rol),
    });
  } catch {
    return [];
  }
}
