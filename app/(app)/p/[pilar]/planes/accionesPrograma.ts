"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirRol, sesionDePilar } from "@/lib/sesion";
import { leerFecha } from "@/lib/historial";
import { esUuid } from "@/lib/filtros";
import { esEstatusCambiable, MAX_MOTIVO, MAX_SERVICIOS, ETIQUETA_ESTATUS } from "@/lib/programa";

type Resultado = { ok: boolean; mensaje: string; cambiados?: number };

/** Los mensajes de las funciones de la base ya vienen en español; aquí se traducen los de Postgres. */
function traducir(m: string) {
  if (m.includes("programa_unq")) return "Ya hay un servicio de ese plan y equipo en esa fecha.";
  if (m.includes("row-level security")) return "No tienes permiso para cambiar el programa.";
  if (m.includes("invalid input syntax")) return "Algún dato no tiene el formato correcto.";
  return m;
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
  if (error) return { ok: false, mensaje: traducir(error.message) };
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
  if (error) return { ok: false, mensaje: traducir(error.message) };
  const n = Number(data) || 0;
  revalidatePath(`/p/${pilar}/planes`);
  return { ok: true, cambiados: n, mensaje: `${plural(n, "servicio", "servicios")} en «${ETIQUETA_ESTATUS[estatus]}».` };
}
