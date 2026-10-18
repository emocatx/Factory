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
  await exigirRol(["admin", "supervisor"]);
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
  await exigirRol(["admin", "supervisor"]);
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
  await exigirRol(["admin", "supervisor"]);
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
