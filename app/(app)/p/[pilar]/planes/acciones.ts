"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar } from "@/lib/catalogos";
import { leerFecha } from "@/lib/historial";
import { hoyMx, TIPOS_PLAN } from "@/lib/planes";
import type { TipoPlan } from "@/lib/tipos";
import { ALMACENES_ELEGIDOS, type Campo, type MapeosGuardados } from "@/lib/plantillaFactory";
import { OMITIR, type Carga } from "@/lib/planAnual";
import { esUuid } from "@/lib/filtros";

type Resultado = { ok: boolean; mensaje: string; detalle?: string[] };
const EDITORES = ["admin", "supervisor", "coordinador"] as const;
/** "2026-10-01" o "01/10/2026" → "2026-10-01"; vacío → null; inválida → undefined. */
const fecha = (v: string | undefined) => (v?.trim() ? leerFecha(v, "dmy")?.slice(0, 10) : null);

function traducir(m: string) {
  if (m.includes("planes_nombre_unq")) return "Ya existe un plan con ese nombre.";
  if (m.includes("row-level security")) return "No tienes permiso para editar planes.";
  if (m.includes("planes_frecuencia")) return "Solo los planes de proveedor pueden ir sin frecuencia.";
  if (m.includes("equipos_clave_unq")) return "dos activos quedarían con la misma clave interna.";
  if (m.includes("equipos_sap_unq")) return "dos activos quedarían con el mismo número SAP.";
  return m;
}

const esTipo = (t: string): t is TipoPlan => TIPOS_PLAN.some((x) => x.valor === t);

export async function crearPlan(pilar: string, d: { nombre: string; tipo: string; cada_dias: number | null; tareas: string }): Promise<Resultado> {
  await exigirRol([...EDITORES]);
  if (!esPilar(pilar)) return { ok: false, mensaje: "Pilar inválido." };
  if (d.nombre.trim().length < 2) return { ok: false, mensaje: "Escribe el nombre del servicio." };
  const tipo = esTipo(d.tipo) ? d.tipo : "preventivo";
  if (d.cada_dias === null ? tipo !== "proveedor" : !Number.isInteger(d.cada_dias) || d.cada_dias < 1)
    return { ok: false, mensaje: "La frecuencia debe ser un número de días mayor a 0." };
  const { error } = await (await createClient()).from("planes_mantenimiento")
    .insert({ pilar, nombre: d.nombre.trim(), tipo, cada_dias: d.cada_dias, tareas: d.tareas.trim() || null });
  if (error) return { ok: false, mensaje: traducir(error.message) };
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, mensaje: `Plan "${d.nombre.trim()}" creado.` };
}

/** Asigna el plan a los equipos elegidos. Sin fecha, conserva el último servicio de los que ya lo tenían. */
export async function asignarPlan(pilar: string, idPlan: string, equipos: string[], ultimo: string): Promise<Resultado> {
  await exigirRol([...EDITORES]);
  if (!esPilar(pilar) || !idPlan || !equipos.length) return { ok: false, mensaje: "Elige un plan y al menos un equipo." };
  const f = fecha(ultimo);
  if (f === undefined) return { ok: false, mensaje: "La fecha del último servicio no es válida." };
  const filas = equipos.map((id_equipo) => ({ id_plan: idPlan, id_equipo, ...(f ? { ultimo_servicio: f } : {}) }));
  const { error } = await (await createClient()).from("plan_equipos")
    .upsert(filas, { onConflict: "id_plan,id_equipo", ignoreDuplicates: !f });
  if (error) return { ok: false, mensaje: traducir(error.message) };
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, mensaje: `Plan asignado a ${equipos.length} equipo${equipos.length === 1 ? "" : "s"}.` };
}

/** Registra el servicio como hecho (último servicio = la fecha dada u hoy): el siguiente se recorre solo. */
export async function marcarHecho(pilar: string, ids: string[], fechaHecho?: string): Promise<Resultado> {
  await exigirRol([...EDITORES]);
  if (!esPilar(pilar) || !ids.length) return { ok: false, mensaje: "Nada que marcar." };
  const f = fechaHecho ? fecha(fechaHecho) : hoyMx();
  if (!f) return { ok: false, mensaje: "La fecha no es válida." };
  const { error } = await (await createClient()).from("plan_equipos").update({ ultimo_servicio: f }).in("id", ids);
  if (error) return { ok: false, mensaje: traducir(error.message) };
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, mensaje: `${ids.length} servicio${ids.length === 1 ? "" : "s"} marcado${ids.length === 1 ? "" : "s"} como hecho${ids.length === 1 ? "" : "s"}.` };
}

export async function quitarPlan(pilar: string, idPlan: string, equipos: string[]): Promise<Resultado> {
  await exigirRol([...EDITORES]);
  if (!esPilar(pilar) || !idPlan || !equipos.length) return { ok: false, mensaje: "Elige un plan y al menos un equipo." };
  const { error } = await (await createClient()).from("plan_equipos").delete().eq("id_plan", idPlan).in("id_equipo", equipos);
  if (error) return { ok: false, mensaje: traducir(error.message) };
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, mensaje: `Plan quitado de ${equipos.length} equipo${equipos.length === 1 ? "" : "s"}.` };
}

export type ResumenCarga = {
  equipos_nuevos: number; equipos_actualizados: number; sap_en_otro_pilar: number;
  planes_nuevos: number; asignaciones_nuevas: number; fichas: number;
};

/**
 * Carga el programa anual ya revisado en la vista previa (ver lib/planAnual.ts → armarCarga): equipos con su
 * categoría, planes, asignaciones desde la fecha del programa y fichas de almacén, todo en una transacción.
 * Volver a cargar el mismo archivo no duplica nada. Solo el administrador.
 */
export async function cargarProgramaAnual(pilar: string, carga: Carga): Promise<Resultado & { resumen?: ResumenCarga }> {
  await exigirRol(["admin"]);
  if (!esPilar(pilar)) return { ok: false, mensaje: "Pilar inválido." };
  if (!Array.isArray(carga?.activos) || !carga.activos.length) return { ok: false, mensaje: "La carga no trae activos." };
  const { data, error } = await (await createClient()).rpc("cargar_programa_anual", { p_pilar: pilar, p_datos: carga });
  if (error) return { ok: false, mensaje: traducir(error.message) };
  revalidatePath(`/p/${pilar}/planes`);
  revalidatePath(`/p/${pilar}/equipos`);
  const r = data as ResumenCarga;
  return {
    ok: true, resumen: r,
    mensaje: `Programa cargado: ${r.equipos_nuevos} equipos nuevos, ${r.equipos_actualizados} actualizados, ${r.planes_nuevos} planes nuevos y ${r.asignaciones_nuevas} asignaciones.`,
  };
}

export type CambioEquipo = {
  sap: string | null; clave: string | null; nombre_antes: string; nombre: string;
  cat_antes: string | null; cat: string | null; alm_antes: string | null; alm: string | null;
};
export type Simulacion = ResumenCarga & {
  existentes_antes: number; cambios_total: number; cambios: CambioEquipo[];
  cambios_por: { nombre: number; categoria: number; almacen: number };
  agenda: { vencidos: number; proximos_30: number; despues: number };
};

/** Corre la carga completa en la base y la deshace: dice qué va a pasar sin guardar nada. */
export async function simularProgramaAnual(pilar: string, carga: Carga): Promise<Resultado & { simulacion?: Simulacion }> {
  await exigirRol(["admin"]);
  if (!esPilar(pilar)) return { ok: false, mensaje: "Pilar inválido." };
  if (!Array.isArray(carga?.activos) || !carga.activos.length) return { ok: false, mensaje: "La carga no trae activos." };
  const { data, error } = await (await createClient()).rpc("simular_programa_anual", { p_pilar: pilar, p_datos: carga });
  if (error) return { ok: false, mensaje: `La carga fallaría: ${traducir(error.message)}` };
  return { ok: true, mensaje: "Simulación lista.", simulacion: data as Simulacion };
}

/**
 * Recuerda lo que la persona ya decidió en una importación, para la empresa: cómo se unen las columnas de ese
 * formato de Excel a la plantilla Factory (si era una tabla) y a qué almacén de Factory va cada almacén del archivo.
 * La próxima vez ya no se pregunta.
 */
export async function recordarImportacion(firma: string | null, mapeo: Partial<Record<Campo, string>> | null, almacenes: Record<string, string>): Promise<Resultado> {
  await exigirRol(["admin"]);
  const columnas = Object.fromEntries(Object.entries(mapeo ?? {}).filter(([k, v]) => /^[a-zA-Z]{2,20}$/.test(k) && typeof v === "string" && v.length <= 80));
  const elegidos = Object.fromEntries(Object.entries(almacenes ?? {}).filter(([k, v]) => k.length <= 60 && (esUuid(v) || v === OMITIR)));
  if (firma && firma.length > 1500) return { ok: false, mensaje: "Formato inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").select("id, mapeos_importacion").single();
  if (error || !data) return { ok: false, mensaje: "No se pudo leer la configuración de la empresa." };
  const actual = (data.mapeos_importacion ?? {}) as MapeosGuardados;
  // los 20 formatos más recientes bastan; el más viejo se olvida
  const formatos = Object.entries(actual).filter(([k]) => k !== ALMACENES_ELEGIDOS && k !== firma).slice(firma ? -19 : -20);
  if (firma && Object.keys(columnas).length) formatos.push([firma, columnas]);
  const recordados = Object.entries({ ...actual[ALMACENES_ELEGIDOS], ...elegidos }).slice(-400);
  const { error: e2 } = await supabase.from("tenants")
    .update({ mapeos_importacion: Object.fromEntries([...formatos, [ALMACENES_ELEGIDOS, Object.fromEntries(recordados)]]) }).eq("id", data.id);
  return e2 ? { ok: false, mensaje: traducir(e2.message) } : { ok: true, mensaje: "Guardado para las próximas importaciones." };
}
