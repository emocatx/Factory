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

// ------------------------------------------------------------------ sugerencia desde fallas
const TEMAS: [string, RegExp][] = [
  ["ruedas", /rueda|llanta/i],
  ["baterías", /bater[ií]a|cargador/i],
  ["frenos", /freno/i],
  ["cadenas y mástil", /cadena|m[aá]stil/i],
  ["sistema hidráulico", /hidr[aá]ul|manguera|aceite|fuga/i],
  ["motor", /motor/i],
  ["sistema eléctrico", /el[eé]ctric|cable|fusible|tarjeta/i],
];

/** Tema que concentra las fallas (por componente o descripción). Null si nada destaca. */
export function temaDominante(fallas: { texto: string; equipo: string | null }[]) {
  if (fallas.length < 5) return null;
  const conteo = TEMAS.map(([tema, rx]) => {
    const suyas = fallas.filter((f) => rx.test(f.texto));
    return { tema, n: suyas.length, equipos: suyas.map((f) => f.equipo ?? "") };
  }).sort((a, b) => b.n - a.n)[0];
  if (conteo.n < 3 || conteo.n / fallas.length < 0.3) return null;
  const fam = /transpaleta/i, mc = /montacarga/i;
  const en = conteo.equipos.filter((e) => fam.test(e)).length / conteo.n >= 0.6 ? "transpaletas"
    : conteo.equipos.filter((e) => mc.test(e)).length / conteo.n >= 0.6 ? "montacargas" : null;
  return { tema: conteo.tema, n: conteo.n, total: fallas.length, en };
}
