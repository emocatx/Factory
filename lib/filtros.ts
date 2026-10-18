export const PERIODOS = [
  { v: "7d", t: "Últimos 7 días", dias: 7 },
  { v: "30d", t: "Últimos 30 días", dias: 30 },
  { v: "90d", t: "Últimos 90 días", dias: 90 },
  { v: "6m", t: "Últimos 6 meses", dias: 182 },
  { v: "12m", t: "Últimos 12 meses", dias: 365 },
  { v: "todo", t: "Todo el periodo", dias: null },
] as const;

export type Filtros = { linea?: string; equipo?: string; periodo?: string; q?: string; estado?: string };

export function rangoPeriodo(v: string | undefined, porDefecto = "30d") {
  const p = PERIODOS.find((x) => x.v === v) ?? PERIODOS.find((x) => x.v === porDefecto)!;
  const desde = p.dias ? new Date(Date.now() - p.dias * 86400000).toISOString() : null;
  return { periodo: p, desde };
}

export const esUuid = (v: string | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
