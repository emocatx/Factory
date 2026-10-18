"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar } from "@/lib/catalogos";

function volver(msg: string, error = false, ancla = ""): never {
  revalidatePath("/", "layout");
  redirect(`/configuracion?${error ? "error" : "ok"}=${encodeURIComponent(msg)}${ancla ? `#${ancla}` : ""}`);
}
const traducir = (m: string) =>
  m.includes("duplicate key") ? "Ya existe un registro con ese nombre." :
  m.includes("row-level security") ? "No tienes permiso para esta acción." :
  m.includes("foreign key") ? "Está en uso; desactívalo en lugar de borrarlo." : m;

export async function crearAlmacen(form: FormData) {
  await exigirRol(["admin", "supervisor"]);
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) volver("Escribe el nombre del almacén", true, "almacenes");
  const { error } = await (await createClient()).from("almacenes").insert({ nombre_almacen: nombre });
  volver(error ? traducir(error.message) : `Almacén ${nombre} creado`, !!error, "almacenes");
}

export async function crearLinea(form: FormData) {
  await exigirRol(["admin", "supervisor"]);
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!nombre) volver("Escribe el nombre de la línea", true, "lineas");
  const { error } = await (await createClient()).from("lineas_dorsales").insert({ nombre_linea: nombre });
  volver(error ? traducir(error.message) : `Línea ${nombre} creada`, !!error, "lineas");
}

export async function crearOrigen(form: FormData) {
  await exigirRol(["admin", "supervisor"]);
  const nombre = String(form.get("nombre") ?? "").trim();
  const pilares = form.getAll("pilares").map(String).filter(esPilar);
  if (!nombre) volver("Escribe el nombre de la causa", true, "origenes");
  const { error } = await (await createClient()).from("origenes_falla").insert({ nombre, pilares: pilares.length === 4 || pilares.length === 0 ? null : pilares, orden: 100 });
  volver(error ? traducir(error.message) : `Causa "${nombre}" agregada`, !!error, "origenes");
}

export async function crearModo(form: FormData) {
  await exigirRol(["admin", "supervisor"]);
  const nombre = String(form.get("nombre") ?? "").trim();
  const pilares = form.getAll("pilares").map(String).filter(esPilar);
  if (!nombre) volver("Escribe el nombre del componente o modo de falla", true, "modos");
  const { error } = await (await createClient()).from("modos_falla").insert({ nombre, pilares: pilares.length === 4 || pilares.length === 0 ? null : pilares, orden: 100 });
  volver(error ? traducir(error.message) : `Componente "${nombre}" agregado`, !!error, "modos");
}

export async function alternarActivo(form: FormData) {
  await exigirRol(["admin", "supervisor"]);
  const tabla = String(form.get("tabla"));
  const id = String(form.get("id"));
  const activo = form.get("activo") === "1";
  const supabase = await createClient();
  const r =
    tabla === "almacenes" ? await supabase.from("almacenes").update({ activo: !activo }).eq("id_almacen", id) :
    tabla === "lineas" ? await supabase.from("lineas_dorsales").update({ activo: !activo }).eq("id_linea", id) :
    tabla === "modos" ? await supabase.from("modos_falla").update({ activo: !activo }).eq("id_modo", id) :
    await supabase.from("origenes_falla").update({ activo: !activo }).eq("id_origen", id);
  volver(r.error ? traducir(r.error.message) : activo ? "Desactivado" : "Activado", !!r.error, tabla);
}

export async function guardarMetas(form: FormData) {
  const { tenant } = await exigirRol(["admin"]);
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const mttr = num("meta_mttr_horas");
  const disp = num("meta_disponibilidad_pct");
  const mtbf = num("meta_mtbf_horas");
  const pilares = form.getAll("pilares_activos").map(String).filter(esPilar);
  if (mttr === null || mttr <= 0 || disp === null || disp <= 0 || disp > 100) volver("Revisa las metas: MTTR mayor a 0 y disponibilidad entre 0 y 100", true, "metas");
  if (!pilares.length) volver("Deja al menos un pilar activo", true, "metas");
  const { error } = await (await createClient()).from("tenants")
    .update({ meta_mttr_horas: mttr, meta_disponibilidad_pct: disp, meta_mtbf_horas: mtbf, pilares_activos: pilares })
    .eq("id", tenant.id);
  volver(error ? traducir(error.message) : "Metas y pilares guardados", !!error, "metas");
}
