/** Cálculos de la pantalla Planes (funciones puras: fechas como "AAAA-MM-DD"). */
import type { PlanEquipo, TipoPlan } from "./tipos";

export const TIPOS_PLAN: { valor: TipoPlan; etiqueta: string }[] = [
  { valor: "preventivo", etiqueta: "Preventivo" },
  { valor: "inspeccion", etiqueta: "Inspección" },
  { valor: "proveedor", etiqueta: "Proveedor" },
];
export const etiquetaTipo = (t: TipoPlan) => TIPOS_PLAN.find((x) => x.valor === t)?.etiqueta ?? t;

export function frecuencia(dias: number | null) {
  if (dias === null) return "Lo define el proveedor";
  const nombres: Record<number, string> = { 1: "Diaria", 7: "Semanal", 14: "Cada 2 semanas", 15: "Quincenal", 30: "Mensual", 60: "Cada 2 meses", 90: "Cada 3 meses", 180: "Cada 6 meses", 365: "Anual" };
  return nombres[dias] ?? `Cada ${dias} días`;
}

/** "21 transpaletas" cuando todos los nombres son de una familia; si no, "21 equipos". */
export function familia(nombres: string[]) {
  const n = nombres.length;
  const todos = (rx: RegExp) => n > 0 && nombres.every((x) => rx.test(x));
  const fam = todos(/transpaleta/i) ? "transpaleta" : todos(/montacarga/i) ? "montacargas" : null;
  if (fam === "montacargas") return `${n} montacargas`;
  if (fam) return `${n} ${fam}${n === 1 ? "" : "s"}`;
  return `${n} equipo${n === 1 ? "" : "s"}`;
}

export const nTareas = (t: string | null) => (t ? t.split(/\n|;/).map((x) => x.trim()).filter(Boolean).length : 0);

// ------------------------------------------------------------------ fechas (UTC, solo día)
const DIA = 86_400_000;
export const aDia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const aIso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const sumarDias = (iso: string, d: number) => aIso(aDia(iso) + d * DIA);
/** Hoy en el centro de México (sin horario de verano desde 2022). */
export const hoyMx = () => aIso(Date.now() - 6 * 3_600_000);

/** Fechas en que toca el servicio entre desde y hasta (incluidas), a partir del próximo. */
export function ocurrencias(a: Pick<PlanEquipo, "proximo" | "cada_dias">, desde: string, hasta: string) {
  if (!a.proximo || !a.cada_dias) return [];
  const fechas: string[] = [];
  for (let f = a.proximo; f <= hasta && fechas.length < 400; f = sumarDias(f, a.cada_dias)) if (f >= desde) fechas.push(f);
  return fechas;
}
