"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar } from "@/lib/catalogos";
import { todasLasPaginas } from "@/lib/datos";
import { leerFecha } from "@/lib/historial";
import { hoyMx, TIPOS_PLAN } from "@/lib/planes";
import type { TipoPlan } from "@/lib/tipos";

type Resultado = { ok: boolean; mensaje: string; detalle?: string[] };
const EDITORES = ["admin", "supervisor", "coordinador"] as const;
const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** "2026-10-01" o "01/10/2026" → "2026-10-01"; vacío → null; inválida → undefined. */
const fecha = (v: string | undefined) => (v?.trim() ? leerFecha(v, "dmy")?.slice(0, 10) : null);

function traducir(m: string) {
  if (m.includes("planes_nombre_unq")) return "Ya existe un plan con ese nombre.";
  if (m.includes("row-level security")) return "No tienes permiso para editar planes.";
  if (m.includes("planes_frecuencia")) return "Solo los planes de proveedor pueden ir sin frecuencia.";
  return m;
}

const esTipo = (t: string): t is TipoPlan => TIPOS_PLAN.some((x) => x.valor === t);
/** "Inspección" / "inspeccion" / "proveedor" → tipo; vacío o desconocido → null. */
const tipoDe = (v: string | undefined) => {
  const n = (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return esTipo(n) ? n : null;
};

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

/**
 * Carga desde Excel: una fila por equipo y servicio. Los planes se reconocen por nombre (se crean
 * si no existen; frecuencia y tareas se toman de la primera fila que las traiga). Los equipos, por
 * SAP o serie o, si no hay, por nombre + almacén. Filas sin servicio se ignoran (equipo sin plan).
 */
export async function importarPlan(pilar: string, filas: Record<string, string>[]): Promise<Resultado> {
  await exigirRol([...EDITORES]);
  if (!esPilar(pilar)) return { ok: false, mensaje: "Pilar inválido." };
  const supabase = await createClient();
  const [{ data: eqs }, { data: planesData }, { data: alm }] = await Promise.all([
    todasLasPaginas<{ id_equipo: string; sap_id: string | null; serie: string | null; nombre_equipo: string; id_almacen: string }>((d, h) =>
      supabase.from("equipos").select("id_equipo, sap_id, serie, nombre_equipo, id_almacen").eq("tipo_pilar", pilar).neq("estatus", "baja").order("id_equipo").range(d, h)),
    supabase.from("planes_mantenimiento").select("id_plan, nombre, tipo, cada_dias, tareas").eq("pilar", pilar),
    supabase.from("almacenes").select("id_almacen, nombre_almacen"),
  ]);
  const almacen = new Map((alm ?? []).map((a) => [a.id_almacen as string, clave(a.nombre_almacen as string)]));
  // SAP o serie: cualquiera de los dos identifica al equipo (los Excel viejos traen la serie como "Serie SAP").
  const porSap = new Map(eqs.flatMap((e) => [e.serie, e.sap_id].filter(Boolean).map((v) => [clave(v!), e.id_equipo] as const)));
  const porSerie = new Map(eqs.filter((e) => e.serie).map((e) => [clave(e.serie!), e.id_equipo]));
  const porNombre = new Map(eqs.map((e) => [`${clave(e.nombre_equipo)}|${almacen.get(e.id_almacen) ?? ""}`, e.id_equipo]));
  type PlanFila = { id_plan: string; nombre: string; tipo: TipoPlan; cada_dias: number | null; tareas: string | null };
  const planes = new Map((planesData ?? []).map((p) => [clave(p.nombre as string), p as PlanFila]));

  const detalle: string[] = [];
  const asignaciones: { fila: number; plan: string; id_equipo: string; ultimo: string | null }[] = [];
  const nuevos = new Map<string, { nombre: string; tipo: TipoPlan; cada_dias: number | null; tareas: string | null }>();
  const cambios = new Map<string, { tipo: TipoPlan; cada_dias: number | null; tareas: string | null }>();

  filas.slice(0, 5000).forEach((f, i) => {
    const n = i + 2; // fila 1 = encabezados en Excel
    const servicio = (f.servicio ?? "").trim().replace(/\s+/g, " ");
    if (!servicio) return;
    const id = (f.sap?.trim() && porSap.get(clave(f.sap))) || (f.serie?.trim() && porSerie.get(clave(f.serie))) || porNombre.get(`${clave(f.equipo ?? "")}|${clave(f.almacen ?? "")}`);
    if (!id) { detalle.push(`Fila ${n}: no se encontró el equipo ${f.sap || f.serie || f.equipo || ""}.`); return; }
    const ultimo = fecha(f.ultimo);
    if (ultimo === undefined) { detalle.push(`Fila ${n}: la fecha "${f.ultimo}" no es válida.`); return; }
    const dias = f.cada?.trim() ? Number(f.cada.replace(/[^\d]/g, "")) : NaN;
    const tareas = f.tareas?.trim() || null;
    const tipo = tipoDe(f.tipo);
    const k = clave(servicio);
    const existente = planes.get(k);
    if (!existente && !nuevos.has(k)) {
      const t = tipo ?? "preventivo";
      if (!(dias >= 1) && t !== "proveedor") { detalle.push(`Fila ${n}: el plan "${servicio}" es nuevo y le falta "Cada (días)".`); return; }
      nuevos.set(k, { nombre: servicio, tipo: t, cada_dias: dias >= 1 ? dias : null, tareas });
    } else if (existente && !cambios.has(k)
      && ((dias >= 1 && dias !== existente.cada_dias) || (tareas && tareas !== existente.tareas) || (tipo && tipo !== existente.tipo))) {
      cambios.set(k, { tipo: tipo ?? existente.tipo, cada_dias: dias >= 1 ? dias : existente.cada_dias, tareas: tareas ?? existente.tareas });
    }
    asignaciones.push({ fila: n, plan: k, id_equipo: id, ultimo });
  });

  if (nuevos.size) {
    const { data, error } = await supabase.from("planes_mantenimiento")
      .insert([...nuevos.values()].map((p) => ({ pilar, ...p }))).select("id_plan, nombre, tipo, cada_dias, tareas");
    if (error) return { ok: false, mensaje: traducir(error.message), detalle };
    (data ?? []).forEach((p) => planes.set(clave(p.nombre as string), p as PlanFila));
  }
  for (const [k, c] of cambios) {
    const { error } = await supabase.from("planes_mantenimiento").update(c).eq("id_plan", planes.get(k)!.id_plan);
    if (error) return { ok: false, mensaje: traducir(error.message), detalle };
  }

  // Con fecha se actualiza el último servicio; sin fecha solo se agrega lo que falte (no se borra la fecha que ya había).
  const filasPlan = asignaciones.map((a) => ({ id_plan: planes.get(a.plan)!.id_plan, id_equipo: a.id_equipo, ultimo_servicio: a.ultimo }));
  const unicas = (xs: typeof filasPlan) => [...new Map(xs.map((x) => [`${x.id_plan}|${x.id_equipo}`, x])).values()];
  const conFecha = unicas(filasPlan.filter((x) => x.ultimo_servicio));
  const sinFecha = unicas(filasPlan.filter((x) => !x.ultimo_servicio)).map(({ id_plan, id_equipo }) => ({ id_plan, id_equipo }));
  for (const [lote, ignorar] of [[conFecha, false], [sinFecha, true]] as const) {
    for (let i = 0; i < lote.length; i += 500) {
      const { error } = await supabase.from("plan_equipos").upsert(lote.slice(i, i + 500), { onConflict: "id_plan,id_equipo", ignoreDuplicates: ignorar });
      if (error) return { ok: false, mensaje: traducir(error.message), detalle };
    }
  }
  revalidatePath(`/p/${pilar}/planes`);
  const partes = [`${conFecha.length + sinFecha.length} asignación(es) cargadas`, nuevos.size && `${nuevos.size} plan(es) nuevos`, cambios.size && `${cambios.size} plan(es) actualizados`].filter(Boolean);
  return { ok: true, mensaje: `${partes.join(", ")}${detalle.length ? `; ${detalle.length} fila(s) omitidas` : ""}.`, detalle };
}
