"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirRol, sesionDePilar } from "@/lib/sesion";
import { leerFecha } from "@/lib/historial";
import { esUuid } from "@/lib/filtros";
import { esEstatusCambiable, MAX_MOTIVO, MAX_SERVICIOS, ETIQUETA_ESTATUS } from "@/lib/programa";

type Resultado = { ok: boolean; mensaje: string; cambiados?: number };

/**
 * Lista blanca: solo pasan tal cual los mensajes que escriben las funciones del programa (ya en español) con sus
 * códigos: 42501 (permiso), 22023 (dato inválido) y FA002 (nada que cambiar). El 42501 de Postgres (RLS, permiso
 * de tabla) viene en inglés y se cambia. Lo demás (llave foránea, tiempo agotado, red…) → mensaje genérico, sin
 * mostrar detalles de la base.
 */
function traducir(e: { message?: string; code?: string }) {
  const m = e.message ?? "";
  if (e.code === "23505" && m.includes("programa_unq")) return "Ya hay un servicio de ese plan y equipo en esa fecha.";
  if (e.code === "42501") {
    return /row-level security|permission denied/i.test(m) || !m ? "No tienes permiso para cambiar el programa." : m;
  }
  if ((e.code === "22023" || e.code === "FA002") && m) return m;
  if (e.code === "22P02" || e.code === "22007" || e.code === "22008") return "Algún dato no tiene el formato correcto.";
  return "No se pudo guardar el cambio en el programa. Intenta de nuevo; si sigue fallando, avisa al administrador.";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function idsValidos(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_SERVICIOS && ids.every((x) => typeof x === "string" && esUuid(x));
}

/** Asigna los servicios del programa a un técnico o supervisor del pilar (supervisor, coordinador o admin). */
export async function asignarPrograma(pilar: string, ids: string[], responsable: string): Promise<Resultado> {
  await exigirRol(["admin", "supervisor", "coordinador"]);
  await sesionDePilar(pilar);
  if (!idsValidos(ids)) return { ok: false, mensaje: `Elige entre 1 y ${MAX_SERVICIOS} servicios.` };
  if (!esUuid(responsable)) return { ok: false, mensaje: "Elige a quién se asigna." };
  const { data, error } = await (await createClient()).rpc("asignar_programa", { p_ids: [...new Set(ids)], p_responsable: responsable });
  if (error) return { ok: false, mensaje: traducir(error) };
  const n = Number(data) || 0;
  revalidatePath(`/p/${pilar}/planes`);
  const omitidos = new Set(ids).size - n;
  return {
    ok: true, cambiados: n,
    mensaje: `${plural(n, "servicio asignado", "servicios asignados")}.${omitidos > 0 ? ` ${plural(omitidos, "no se pudo asignar", "no se pudieron asignar")} (ya en ejecución, cerrados o fuera de su alcance).` : ""}`,
  };
}

/**
 * Cambia el estatus de servicios del programa. Completado: fecha realizada (hoy si no viene) y recorre el último
 * servicio del plan. Reprogramado: nueva fecha y motivo. No realizado: motivo. El técnico solo toca lo asignado a él.
 */
export async function cambiarEstatusPrograma(
  pilar: string, ids: string[], estatus: string, opciones: { fecha?: string; motivo?: string } = {},
): Promise<Resultado> {
  await exigirRol(["admin", "supervisor", "coordinador", "tecnico"]);
  await sesionDePilar(pilar);
  if (!idsValidos(ids)) return { ok: false, mensaje: `Elige entre 1 y ${MAX_SERVICIOS} servicios.` };
  if (!esEstatusCambiable(estatus)) return { ok: false, mensaje: "Estatus inválido." };
  const textoFecha = typeof opciones.fecha === "string" ? opciones.fecha.trim() : "";
  const fecha = textoFecha ? leerFecha(textoFecha, "dmy")?.slice(0, 10) : null;
  if (fecha === undefined) return { ok: false, mensaje: "La fecha no es válida." };
  const motivo = typeof opciones.motivo === "string" ? opciones.motivo.trim() : "";
  if (motivo.length > MAX_MOTIVO) return { ok: false, mensaje: `El motivo es demasiado largo (máximo ${MAX_MOTIVO} caracteres).` };
  if (estatus === "reprogramado" && !fecha) return { ok: false, mensaje: "Indica la nueva fecha." };
  if (estatus === "reprogramado" && !motivo) return { ok: false, mensaje: "Indica el motivo de la reprogramación." };
  if (estatus === "no_realizado" && !motivo) return { ok: false, mensaje: "Indica por qué no se realizó." };

  const { data, error } = await (await createClient()).rpc("cambiar_estatus_programa", {
    p_ids: [...new Set(ids)], p_estatus: estatus, p_fecha: fecha, p_motivo: motivo || null,
  });
  if (error) return { ok: false, mensaje: traducir(error) };
  const n = Number(data) || 0;
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, cambiados: n, mensaje: `${plural(n, "servicio", "servicios")} en «${ETIQUETA_ESTATUS[estatus]}».` };
}
