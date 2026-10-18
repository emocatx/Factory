"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Pilar, Prioridad } from "@/lib/tipos";

export type Resultado = { ok: true; mensaje: string; folio?: string } | { ok: false; error: string; campos?: Record<string, string> };

function traducir(m: string): string {
  if (m.includes("folio_ticket")) return "Ese folio ya existe en tu organización.";
  if (m.includes("row-level security")) return "No tienes permiso para esta acción en este pilar.";
  if (m.includes("orden_cierre_completo")) return "Para cerrar hace falta el origen de falla (y en Dorsales, el almacén).";
  if (m.includes("orden_destino_valido")) return "Falta el equipo (o la línea en Dorsales).";
  if (m.includes("orden_fechas_validas")) return "La fecha de cierre no puede ser anterior al ingreso.";
  if (m.includes("no pertenece a la línea")) return "El equipo no pertenece a la línea seleccionada.";
  return m;
}

function refrescar(pilar: Pilar) {
  revalidatePath(`/p/${pilar}`, "layout");
  revalidatePath("/");
}

// ------------------------------------------------------------------ registro
export async function registrarSolicitud(pilar: Pilar, d: {
  folio: string;
  id_linea: string;
  id_almacen: string;
  id_equipo: string;
  id_origen: string;
  prioridad: Prioridad;
  fecha_ingreso: string;
  solicitante_nombre: string;
  solicitante_correo: string;
  recibe_nombre: string;
  descripcion: string;
}): Promise<Resultado> {
  const campos: Record<string, string> = {};
  if (pilar === "dorsales" && !d.id_linea) campos.id_linea = "Selecciona la línea.";
  if (pilar !== "dorsales" && !d.id_equipo) campos.id_equipo = "Selecciona el equipo.";
  if (!d.solicitante_nombre.trim()) campos.solicitante_nombre = "Escribe quién solicita.";
  if (!d.descripcion.trim()) campos.descripcion = "Describe la falla.";
  if (d.folio && !/^[A-Za-z0-9][A-Za-z0-9 \-]{1,19}$/.test(d.folio.trim()))
    campos.folio = "Solo letras, números, espacios y guiones (2 a 20).";
  if (Object.keys(campos).length) return { ok: false, error: "Revisa los campos marcados.", campos };

  const supabase = await createClient();
  if (d.folio.trim()) {
    const { data: libre } = await supabase.rpc("folio_disponible", { p_folio: d.folio });
    if (libre === false) return { ok: false, error: "Revisa los campos marcados.", campos: { folio: "Ese folio ya existe." } };
  }
  const { data, error } = await supabase
    .from("ordenes_mantenimiento")
    .insert({
      pilar,
      folio_ticket: d.folio.trim() || null,
      id_linea: d.id_linea || null,
      id_equipo: d.id_equipo || null,
      id_almacen: d.id_almacen || null,
      id_origen: d.id_origen || null,
      prioridad: d.prioridad,
      fecha_ingreso: d.fecha_ingreso || new Date().toISOString(),
      solicitante_nombre: d.solicitante_nombre.trim(),
      solicitante_correo: d.solicitante_correo.trim() || null,
      recibe_nombre: d.recibe_nombre.trim() || null,
      descripcion_falla: d.descripcion.trim(),
    })
    .select("folio_ticket")
    .single();
  if (error) return { ok: false, error: traducir(error.message) };
  refrescar(pilar);
  return { ok: true, mensaje: "Solicitud registrada", folio: data.folio_ticket };
}

export async function validarFolio(folio: string): Promise<boolean> {
  if (!folio.trim()) return true;
  const supabase = await createClient();
  const { data } = await supabase.rpc("folio_disponible", { p_folio: folio });
  return data !== false;
}

// ------------------------------------------------------------------ flujo
export async function asignarOrden(pilar: Pilar, id: string, tecnico: string, prioridad: Prioridad): Promise<Resultado> {
  if (!tecnico) return { ok: false, error: "Elige a quién asignar." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_orden", { p_id_orden: id, p_tecnico: tecnico, p_prioridad: prioridad });
  if (error) return { ok: false, error: traducir(error.message) };
  refrescar(pilar);
  return { ok: true, mensaje: "Orden asignada" };
}

export async function iniciarOrden(pilar: Pilar, id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("iniciar_orden", { p_id_orden: id });
  if (error) return { ok: false, error: traducir(error.message) };
  refrescar(pilar);
  return { ok: true, mensaje: "Atención iniciada" };
}

export async function concluirOrden(pilar: Pilar, id: string, d: {
  id_origen: string;
  id_modo: string;
  id_almacen: string;
  id_equipo: string;
  notas: string;
  fecha_cierre: string;
}): Promise<Resultado> {
  const campos: Record<string, string> = {};
  if (!d.id_modo) campos.id_modo = "Elige qué componente falló.";
  if (!d.id_origen) campos.id_origen = "Elige la causa de la falla.";
  if (pilar === "dorsales" && !d.id_almacen) campos.id_almacen = "Elige el almacén.";
  if (Object.keys(campos).length) return { ok: false, error: "Faltan datos para cerrar.", campos };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("concluir_orden", {
    p_id_orden: id,
    p_id_origen: d.id_origen,
    p_id_modo: d.id_modo,
    p_id_almacen: d.id_almacen || null,
    p_id_equipo: d.id_equipo || null,
    p_notas: d.notas.trim() || null,
    p_fecha_cierre: d.fecha_cierre || null,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  refrescar(pilar);
  const o = data as { folio_ticket: string; tiempo_paro_horas: number };
  return { ok: true, mensaje: `Orden ${o.folio_ticket} cerrada · ${Number(o.tiempo_paro_horas).toFixed(1)} h de paro` };
}

export async function cancelarOrden(pilar: Pilar, id: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, error: "Escribe el motivo de la cancelación.", campos: { motivo: "Obligatorio." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_orden", { p_id_orden: id, p_motivo: motivo });
  if (error) return { ok: false, error: traducir(error.message) };
  refrescar(pilar);
  return { ok: true, mensaje: "Solicitud cancelada" };
}
