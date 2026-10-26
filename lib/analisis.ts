/**
 * Análisis de falla (funciones puras, sin acceso a datos).
 * Unidad de análisis: equipo (o línea en Dorsales, porque Operaciones suele reportar sin equipo).
 */

import { refEquipo } from "./equipos";

export type FilaFalla = {
  id_orden: string;
  id_equipo: string | null;
  nombre_equipo: string | null;
  sap_id: string | null;
  serie: string | null;
  id_linea: string | null;
  nombre_linea: string | null;
  id_origen: string | null;
  nombre_origen: string | null;
  id_modo: string | null;
  nombre_modo: string | null;
  estatus_orden: string;
  fecha_ingreso: string;
  fecha_cierre: string | null;
  tiempo_paro_horas: number | null;
  horas_transcurridas: number | null;
};

export type Unidad = { clave: string; nombre: string; detalle: string | null };
export type Metrica = "horas" | "fallas";

export type FilaPareto = Unidad & { fallas: number; horas: number; valor: number; pct: number; acumulado: number };
export type Cuadrante = "agudo_cronico" | "cronico" | "agudo" | "control";
export type PuntoActor = Unidad & { fallas: number; mttr: number; horas: number; cuadrante: Cuadrante };
export type Matriz = { filas: Unidad[]; columnas: { clave: string; nombre: string }[]; celdas: number[][]; max: number };
export type Repeticion = Unidad & { componente: string; veces: number; ultima: string };

const SIN_EQUIPO = "__sin_equipo__";

export function unidadDe(f: FilaFalla, porLinea: boolean): Unidad {
  if (porLinea) {
    if (f.id_linea) return { clave: f.id_linea, nombre: f.nombre_linea ?? "Línea", detalle: null };
    return { clave: SIN_EQUIPO, nombre: "Sin línea", detalle: null };
  }
  if (f.id_equipo) return { clave: f.id_equipo, nombre: f.nombre_equipo ?? "Equipo", detalle: refEquipo(f) };
  return { clave: SIN_EQUIPO, nombre: "Sin equipo identificado", detalle: null };
}

const cerrada = (f: FilaFalla) => f.estatus_orden === "cerrada";
/** Horas de paro: real si está cerrada; transcurridas si sigue abierta (paro en curso). */
const horasDe = (f: FilaFalla) => Number(cerrada(f) ? f.tiempo_paro_horas ?? 0 : f.horas_transcurridas ?? 0);

function agrupar(filas: FilaFalla[], porLinea: boolean) {
  const m = new Map<string, { u: Unidad; fallas: number; horas: number; cerradas: number; horasCerradas: number }>();
  for (const f of filas) {
    const u = unidadDe(f, porLinea);
    const g = m.get(u.clave) ?? { u, fallas: 0, horas: 0, cerradas: 0, horasCerradas: 0 };
    g.fallas += 1;
    g.horas += horasDe(f);
    if (cerrada(f)) { g.cerradas += 1; g.horasCerradas += Number(f.tiempo_paro_horas ?? 0); }
    m.set(u.clave, g);
  }
  return [...m.values()];
}

/** Pareto por horas de paro o por frecuencia, con porcentaje acumulado. */
export function pareto(filas: FilaFalla[], porLinea: boolean, metrica: Metrica): FilaPareto[] {
  const g = agrupar(filas, porLinea).map((x) => ({ ...x.u, fallas: x.fallas, horas: x.horas, valor: metrica === "horas" ? x.horas : x.fallas }));
  g.sort((a, b) => b.valor - a.valor || b.fallas - a.fallas || a.nombre.localeCompare(b.nombre));
  const total = g.reduce((s, x) => s + x.valor, 0) || 1;
  let acc = 0;
  return g.map((x) => {
    acc += x.valor;
    return { ...x, pct: (100 * x.valor) / total, acumulado: (100 * acc) / total };
  });
}

/**
 * Matriz de malos actores (frecuencia vs MTTR). Los límites son los promedios de las unidades,
 * como en el diagrama de dispersión logarítmica clásico de confiabilidad.
 */
export function malosActores(filas: FilaFalla[], porLinea: boolean) {
  const g = agrupar(filas, porLinea).filter((x) => x.cerradas > 0);
  const puntos = g.map((x) => ({ ...x.u, fallas: x.fallas, horas: x.horas, mttr: x.horasCerradas / x.cerradas }));
  const n = puntos.length || 1;
  const limFallas = puntos.reduce((s, p) => s + p.fallas, 0) / n;
  const limMttr = puntos.reduce((s, p) => s + p.mttr, 0) / n;
  const conCuadrante: PuntoActor[] = puntos.map((p) => {
    const muchas = p.fallas > limFallas;
    const largas = p.mttr > limMttr;
    const cuadrante: Cuadrante = muchas && largas ? "agudo_cronico" : muchas ? "cronico" : largas ? "agudo" : "control";
    return { ...p, cuadrante };
  });
  conCuadrante.sort((a, b) => b.horas - a.horas);
  return { puntos: conCuadrante, limFallas, limMttr };
}

/** Cruce unidad × componente (o causa). Solo órdenes cerradas, que son las clasificadas. */
export function matriz(filas: FilaFalla[], porLinea: boolean, por: "modo" | "causa", maxFilas = 8, maxCols = 6): Matriz {
  const cl = filas.filter(cerrada);
  const colDe = (f: FilaFalla) =>
    por === "modo" ? { clave: f.id_modo ?? "_", nombre: f.nombre_modo ?? "Sin clasificar" } : { clave: f.id_origen ?? "_", nombre: f.nombre_origen ?? "Sin clasificar" };
  const totFila = new Map<string, { u: Unidad; n: number }>();
  const totCol = new Map<string, { c: { clave: string; nombre: string }; n: number }>();
  for (const f of cl) {
    const u = unidadDe(f, porLinea);
    const c = colDe(f);
    totFila.set(u.clave, { u, n: (totFila.get(u.clave)?.n ?? 0) + 1 });
    totCol.set(c.clave, { c, n: (totCol.get(c.clave)?.n ?? 0) + 1 });
  }
  const filasM = [...totFila.values()].sort((a, b) => b.n - a.n).slice(0, maxFilas).map((x) => x.u);
  const columnas = [...totCol.values()].sort((a, b) => b.n - a.n).slice(0, maxCols).map((x) => x.c);
  const celdas = filasM.map(() => columnas.map(() => 0));
  for (const f of cl) {
    const i = filasM.findIndex((u) => u.clave === unidadDe(f, porLinea).clave);
    const j = columnas.findIndex((c) => c.clave === colDe(f).clave);
    if (i >= 0 && j >= 0) celdas[i][j] += 1;
  }
  return { filas: filasM, columnas, celdas, max: Math.max(1, ...celdas.flat()) };
}

/**
 * Reincidencia: una falla cuenta como repetida si la misma unidad tuvo una orden CERRADA del mismo
 * componente en los `dias` previos a su ingreso. `historial` debe incluir órdenes desde `desde - dias`.
 */
export function reincidencia(historial: FilaFalla[], desdeISO: string | null, porLinea: boolean, dias = 30) {
  const desde = desdeISO ? new Date(desdeISO).getTime() : -Infinity;
  const ventana = dias * 24 * 3600 * 1000;
  const cierres = historial.filter((f) => cerrada(f) && f.id_modo && f.fecha_cierre);
  const evaluadas = historial.filter((f) => f.id_modo && new Date(f.fecha_ingreso).getTime() >= desde);
  const pares = new Map<string, Repeticion>();
  let repetidas = 0;
  for (const f of evaluadas) {
    const u = unidadDe(f, porLinea);
    if (u.clave === SIN_EQUIPO) continue;
    const t = new Date(f.fecha_ingreso).getTime();
    const previa = cierres.some((c) =>
      c.id_orden !== f.id_orden && c.id_modo === f.id_modo && unidadDe(c, porLinea).clave === u.clave &&
      new Date(c.fecha_cierre!).getTime() <= t && t - new Date(c.fecha_cierre!).getTime() <= ventana);
    if (previa) {
      repetidas += 1;
      const k = `${u.clave}|${f.id_modo}`;
      const r = pares.get(k) ?? { ...u, componente: f.nombre_modo ?? "", veces: 0, ultima: f.fecha_ingreso };
      r.veces += 1;
      if (f.fecha_ingreso > r.ultima) r.ultima = f.fecha_ingreso;
      pares.set(k, r);
    }
  }
  const base = evaluadas.filter((f) => unidadDe(f, porLinea).clave !== SIN_EQUIPO).length;
  return {
    repetidas,
    base,
    pct: base ? (100 * repetidas) / base : null,
    pares: [...pares.values()].sort((a, b) => b.veces - a.veces).slice(0, 6),
  };
}

/** Calidad del dato: cuántas fallas del periodo no se pueden analizar por completo. */
export function calidad(filas: FilaFalla[], porLinea: boolean) {
  const cl = filas.filter(cerrada);
  return {
    total: filas.length,
    abiertas: filas.length - cl.length,
    sinModo: cl.filter((f) => !f.id_modo).length,
    sinCausa: cl.filter((f) => !f.id_origen).length,
    sinUnidad: filas.filter((f) => unidadDe(f, porLinea).clave === SIN_EQUIPO).length,
  };
}

export const ETIQUETA_CUADRANTE: Record<Cuadrante, { titulo: string; accion: string }> = {
  agudo_cronico: { titulo: "Agudo y crónico", accion: "Fallan seguido y tardan en repararse: candidatos a reemplazo o rediseño." },
  cronico: { titulo: "Crónico", accion: "Muchas fallas cortas: reforzar preventivo y revisar la forma de operar." },
  agudo: { titulo: "Agudo", accion: "Pocas fallas pero largas: refacciones críticas en stock y procedimiento de reparación." },
  control: { titulo: "Bajo control", accion: "Por debajo del promedio en frecuencia y duración." },
};
