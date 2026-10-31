/**
 * Programa de mantenimiento preventivo (tabla programa_mantenimiento, vista v_programa): estatus, tipos y semanas
 * ISO. Funciones puras, se pueden usar en el cliente; las consultas están en lib/programaDatos.ts.
 */
import type { Pilar } from "./tipos";

export const ESTATUS_PROGRAMA = ["programado", "asignado", "en_ejecucion", "completado", "reprogramado", "no_realizado"] as const;
export type EstatusPrograma = (typeof ESTATUS_PROGRAMA)[number];
export const esEstatusPrograma = (v: string): v is EstatusPrograma => (ESTATUS_PROGRAMA as readonly string[]).includes(v);

export const ETIQUETA_ESTATUS: Record<EstatusPrograma, string> = {
  programado: "Programado", asignado: "Asignado", en_ejecucion: "En ejecución",
  completado: "Completado", reprogramado: "Reprogramado", no_realizado: "No realizado",
};

/** Estatus que se ponen con cambiar_estatus_programa ("asignado" va por asignar_programa). */
export const ESTATUS_CAMBIABLES = ["programado", "en_ejecucion", "completado", "reprogramado", "no_realizado"] as const;
export type EstatusCambiable = (typeof ESTATUS_CAMBIABLES)[number];
export const esEstatusCambiable = (v: string): v is EstatusCambiable => (ESTATUS_CAMBIABLES as readonly string[]).includes(v);

export const MAX_MOTIVO = 300;
/** Servicios que se pueden tocar en una sola acción (lo mismo limita la base). */
export const MAX_SERVICIOS = 2000;

/** Una fila de v_programa. Fechas como "AAAA-MM-DD". */
export type FilaPrograma = {
  id: string; pilar: Pilar; id_plan: string; id_equipo: string;
  fecha_programada: string; fecha_original: string | null; fecha_plan: string;
  estatus: EstatusPrograma; id_responsable: string | null; responsable: string | null;
  fecha_realizada: string | null; motivo: string | null; origen: "programa-anual" | "manual";
  nombre_equipo: string; sap_id: string | null; clave_id: string | null; categoria: string | null;
  id_almacen: string | null; nombre_almacen: string | null; plan: string; cada_dias: number | null;
  vencido: boolean; a_tiempo: boolean;
};

/** Lo que piden la lista de la semana y la de vencidos (menos datos por fila que la vista completa). */
export const COLUMNAS_LISTA = [
  "id", "fecha_programada", "fecha_original", "estatus", "id_responsable", "responsable", "fecha_realizada", "motivo",
  "nombre_equipo", "sap_id", "clave_id", "nombre_almacen", "plan", "vencido",
] as const satisfies readonly (keyof FilaPrograma)[];
export type FilaLista = Pick<FilaPrograma, (typeof COLUMNAS_LISTA)[number]>;

/** Estatus que siguen abiertos (lo que falta por hacer). */
export const ESTATUS_ABIERTOS = ["programado", "asignado", "en_ejecucion", "reprogramado"] as const satisfies readonly EstatusPrograma[];

/** Conteos de un grupo (empresa, almacén o responsable) en el periodo, medidos por la fecha del programa. */
export type MetricasPrograma = {
  /** Con fecha del programa hasta hoy. */
  programados: number;
  completados: number;
  /** Completados a más tardar el domingo de la semana de su fecha del programa. */
  a_tiempo: number;
  /** Abiertos de una semana anterior a la actual. */
  vencidos: number;
  reprogramados: number;
  no_realizados: number;
  /** Todo el periodo, también lo que todavía no toca. */
  total: number;
};
export type ResumenPrograma = {
  hoy: string;
  totales: MetricasPrograma;
  por_almacen: (MetricasPrograma & { id_almacen: string; nombre_almacen: string | null })[];
  /** id_responsable null = sin asignar. */
  por_responsable: (MetricasPrograma & { id_responsable: string | null; responsable: string | null })[];
  /** Semana ISO y mes actuales (por fecha programada). */
  semana: { total: number; completados: number };
  mes: { total: number; completados: number };
};

/** Porcentaje con un decimal; null si no hay base. */
export const porcentaje = (parte: number, base: number) => (base > 0 ? Math.round((parte / base) * 1000) / 10 : null);
export const cumplimiento = (m: Pick<MetricasPrograma, "completados" | "programados">) => porcentaje(m.completados, m.programados);
export const cumplimientoATiempo = (m: Pick<MetricasPrograma, "a_tiempo" | "programados">) => porcentaje(m.a_tiempo, m.programados);

// ── Semanas ISO (lunes a domingo) ─────────────────────────────────────────────────────────────────
const DIA = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Lunes y domingo de la semana ISO; null si la semana no existe en ese año. */
export function rangoSemana(anio: number, semana: number): { desde: string; hasta: string } | null {
  if (!Number.isInteger(anio) || !Number.isInteger(semana) || anio < 2000 || anio > 2100 || semana < 1 || semana > semanasDelAnio(anio)) return null;
  const cuatroEne = Date.UTC(anio, 0, 4);
  const lunes = cuatroEne - (((new Date(cuatroEne).getUTCDay() + 6) % 7) * DIA) + (semana - 1) * 7 * DIA;
  return { desde: iso(lunes), hasta: iso(lunes + 6 * DIA) };
}

/** Semana ISO de una fecha "AAAA-MM-DD". */
export function semanaDe(fecha: string): { anio: number; semana: number } {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  const jueves = t + (3 - ((new Date(t).getUTCDay() + 6) % 7)) * DIA;
  const anio = new Date(jueves).getUTCFullYear();
  return { anio, semana: 1 + Math.floor((jueves - Date.UTC(anio, 0, 1)) / (7 * DIA)) };
}

/** 52 o 53. */
export const semanasDelAnio = (anio: number) => semanaDe(`${anio}-12-28`).semana;
