export const PERIODOS = [
  { v: "hoy", t: "Hoy", dias: 1 },
  { v: "7d", t: "Últimos 7 días", dias: 7 },
  { v: "30d", t: "Últimos 30 días", dias: 30 },
  { v: "90d", t: "Últimos 90 días", dias: 90 },
  { v: "6m", t: "Últimos 6 meses", dias: 182 },
  { v: "12m", t: "Últimos 12 meses", dias: 365 },
  { v: "todo", t: "Todo el periodo", dias: null },
] as const;

export type Filtros = { linea?: string; equipo?: string; periodo?: string; q?: string; estado?: string };

/** Periodo por omisión en todas las páginas (el mismo del Resumen). */
export const PERIODO_DEFECTO = "30d";

/**
 * Filtros que viajan entre páginas del pilar (Resumen, Órdenes, Indicadores, Análisis…):
 * el almacén y el periodo elegidos se conservan al moverse por el menú y por las tarjetas.
 */
export const CONTEXTO = ["almacen", "periodo"] as const;

/** Añade a un enlace el almacén y el periodo actuales (los que ya traiga el enlace mandan). */
export function conContexto(href: string, actuales: URLSearchParams | Record<string, string | null | undefined>) {
  const [ruta, qs = ""] = href.split("?");
  const p = new URLSearchParams(qs);
  for (const k of CONTEXTO) {
    const v = actuales instanceof URLSearchParams ? actuales.get(k) : actuales[k];
    if (v && !p.has(k)) p.set(k, v);
  }
  const s = p.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/**
 * Condición PostgREST (para .or()) de las órdenes de un almacén, contadas igual que en el Resumen:
 * por el almacén actual del equipo y, si la orden no tiene equipo, por el almacén de la orden.
 */
export function ordenesDelAlmacen(almacen: string, equipos: { id_equipo: string; id_almacen: string | null }[]) {
  const ids = equipos.filter((e) => e.id_almacen === almacen).map((e) => e.id_equipo);
  const sinEquipo = `and(id_equipo.is.null,id_almacen.eq.${almacen})`;
  return ids.length ? `id_equipo.in.(${ids.join(",")}),${sinEquipo}` : sinEquipo;
}

export function rangoPeriodo(v: string | undefined, porDefecto = "30d") {
  const p = PERIODOS.find((x) => x.v === v) ?? PERIODOS.find((x) => x.v === porDefecto)!;
  const desde = p.dias ? new Date(Date.now() - p.dias * 86400000).toISOString() : null;
  return { periodo: p, desde };
}

export const esUuid = (v: string | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
