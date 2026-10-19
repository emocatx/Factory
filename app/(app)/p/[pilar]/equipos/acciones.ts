"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar } from "@/lib/catalogos";

function volver(pilar: string, msg: string, error = false): never {
  revalidatePath(`/p/${pilar}`, "layout");
  redirect(`/p/${pilar}/equipos?${error ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

function traducir(m: string) {
  if (m.includes("equipos_sap_unq")) return "Ya existe un equipo con esa serie SAP.";
  if (m.includes("equipos_clave_unq")) return "Ya existe un equipo con esa clave.";
  if (m.includes("row-level security")) return "No tienes permiso para modificar equipos.";
  return m;
}

function leer(form: FormData) {
  return {
    id_almacen: String(form.get("id_almacen") ?? ""),
    id_linea: String(form.get("id_linea") ?? "") || null,
    nombre_equipo: String(form.get("nombre") ?? "").trim(),
    sap_id: String(form.get("sap_id") ?? "").trim() || null,
    clave_id: String(form.get("clave_id") ?? "").trim() || null,
  };
}

export async function guardarEquipo(form: FormData) {
  await exigirRol(["admin"]);
  const pilar = String(form.get("pilar"));
  if (!esPilar(pilar)) return;
  const id = String(form.get("id_equipo") ?? "");
  const fila = leer(form);
  if (!fila.nombre_equipo || !fila.id_almacen) volver(pilar, "Captura nombre y almacén del equipo", true);
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("equipos").update(fila).eq("id_equipo", id)
    : await supabase.from("equipos").insert({ ...fila, tipo_pilar: pilar });
  volver(pilar, error ? traducir(error.message) : id ? `Equipo ${fila.nombre_equipo} actualizado` : `Equipo ${fila.nombre_equipo} dado de alta`, !!error);
}

export async function cambiarBaja(form: FormData) {
  await exigirRol(["admin"]);
  const pilar = String(form.get("pilar"));
  if (!esPilar(pilar)) return;
  const id = String(form.get("id_equipo"));
  const reactivar = form.get("reactivar") === "1";
  const supabase = await createClient();
  if (!reactivar) {
    const { count } = await supabase.from("ordenes_mantenimiento").select("id_orden", { count: "exact", head: true })
      .eq("id_equipo", id).in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);
    if (count) volver(pilar, "El equipo tiene órdenes abiertas; ciérralas antes de darlo de baja", true);
  }
  const { error } = await supabase.from("equipos").update({ estatus: reactivar ? "activo" : "baja" }).eq("id_equipo", id);
  volver(pilar, error ? traducir(error.message) : reactivar ? "Equipo reactivado" : "Equipo dado de baja", !!error);
}

/** Cambio masivo: mover varios equipos a otro almacén (y línea, en Dorsales). */
export async function moverEquipos(form: FormData) {
  await exigirRol(["admin"]);
  const pilar = String(form.get("pilar"));
  if (!esPilar(pilar)) return;
  const ids = form.getAll("sel").map(String).filter(Boolean);
  const almacen = String(form.get("destino_almacen") ?? "");
  const linea = String(form.get("destino_linea") ?? "");
  if (!ids.length) volver(pilar, "Selecciona al menos un equipo", true);
  if (!almacen && !linea) volver(pilar, "Elige el almacén o la línea destino", true);
  const cambio: Record<string, string> = {};
  if (almacen) cambio.id_almacen = almacen;
  if (linea) cambio.id_linea = linea;
  const supabase = await createClient();
  const { error } = await supabase.from("equipos").update(cambio).in("id_equipo", ids);
  volver(pilar, error ? traducir(error.message) : `${ids.length} equipo${ids.length === 1 ? "" : "s"} actualizado${ids.length === 1 ? "" : "s"}`, !!error);
}

/**
 * Alta masiva de equipos de un pilar. El almacén se indica por nombre.
 * Omite series SAP o claves que ya existen en la organización; opcionalmente crea los almacenes que falten.
 */
export async function importarEquipos(
  pilar: string,
  filas: Record<string, string>[],
  crearAlmacenes: boolean,
): Promise<{ ok: boolean; mensaje: string; detalle?: string[] }> {
  await exigirRol(["admin"]);
  if (!esPilar(pilar)) return { ok: false, mensaje: "Pilar inválido." };
  const supabase = await createClient();
  const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

  const [{ data: alm }, { data: eqs }] = await Promise.all([
    supabase.from("almacenes").select("id_almacen, nombre_almacen"),
    supabase.from("equipos").select("sap_id, clave_id").range(0, 49999),
  ]);
  const almacenes = new Map((alm ?? []).map((a) => [clave(a.nombre_almacen as string), a.id_almacen as string]));
  const saps = new Set((eqs ?? []).map((e) => e.sap_id as string | null).filter(Boolean).map((s) => clave(s!)));
  const claves = new Set((eqs ?? []).map((e) => e.clave_id as string | null).filter(Boolean).map((s) => clave(s!)));

  const lote = filas.slice(0, 2000);
  // Almacenes faltantes
  const faltan = [...new Set(lote.map((f) => String(f.almacen ?? "").trim().replace(/\s+/g, " ")).filter((n) => n && !almacenes.has(clave(n))))];
  if (faltan.length && crearAlmacenes) {
    const { data: creados, error } = await supabase.from("almacenes").insert(faltan.map((n) => ({ nombre_almacen: n }))).select("id_almacen, nombre_almacen");
    if (error) return { ok: false, mensaje: traducir(error.message) };
    (creados ?? []).forEach((a) => almacenes.set(clave(a.nombre_almacen as string), a.id_almacen as string));
  }

  const detalle: string[] = [];
  const nuevos: { nombre_equipo: string; sap_id: string | null; clave_id: string | null; id_almacen: string; tipo_pilar: string }[] = [];
  lote.forEach((f, i) => {
    const n = i + 1;
    const nombre = String(f.nombre ?? "").trim();
    const sap = String(f.sap ?? "").trim() || null;
    const cl = String(f.clave ?? "").trim() || null;
    const a = String(f.almacen ?? "").trim().replace(/\s+/g, " ");
    if (!nombre || !a) { detalle.push(`Fila ${n}: falta nombre o almacén.`); return; }
    const idAlm = almacenes.get(clave(a));
    if (!idAlm) { detalle.push(`Fila ${n} (${nombre}): el almacén "${a}" no existe.`); return; }
    if (sap && saps.has(clave(sap))) { detalle.push(`Fila ${n} (${nombre}): la serie SAP ${sap} ya existe; se omitió.`); return; }
    if (cl && claves.has(clave(cl))) { detalle.push(`Fila ${n} (${nombre}): la clave ${cl} ya existe; se omitió.`); return; }
    if (sap) saps.add(clave(sap));
    if (cl) claves.add(clave(cl));
    nuevos.push({ nombre_equipo: nombre, sap_id: sap, clave_id: cl, id_almacen: idAlm, tipo_pilar: pilar });
  });

  for (let i = 0; i < nuevos.length; i += 500) {
    const { error } = await supabase.from("equipos").insert(nuevos.slice(i, i + 500));
    if (error) return { ok: false, mensaje: `Se detuvo en el bloque ${i / 500 + 1}: ${traducir(error.message)}`, detalle };
  }
  revalidatePath(`/p/${pilar}`, "layout");
  const creadosAlm = crearAlmacenes && faltan.length ? ` y ${faltan.length} almacén(es) nuevos` : "";
  return { ok: true, mensaje: `${nuevos.length} equipo(s) dados de alta${creadosAlm}${detalle.length ? `; ${detalle.length} fila(s) omitidas` : ""}.`, detalle };
}
