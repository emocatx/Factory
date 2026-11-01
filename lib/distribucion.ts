// Distribución real de una nave, sacada de su plano (DXF o PDF de AutoCAD) por el planeador
// (D:\Cargas\Planos\<almacén>.distribucion.json). Se guarda compacta en almacenes.ficha.distribucion y la
// planta 3D dibuja con ella la nave a su medida: contorno, andenes en su muro, bloques de racks y zonas.
// Metros, con origen en la esquina SO de la nave; x hacia el E del dibujo, y hacia el N del dibujo.

export type Muro = "N" | "S" | "E" | "O";
export type TipoAnden = "anden" | "rampa" | "no_operativo";

export type Distribucion = {
  v: 1;
  fuente: "DXF" | "PDF";
  nave: { largo: number; ancho: number; contorno?: [number, number][] };
  /** Cada cortina sobre su muro: x, y es el centro de la cortina. */
  andenes: { num: number; tipo: TipoAnden; muro: Muro; x: number; y: number; ancho: number }[];
  /** Bloques de racks: esquina mínima en x y y; orientación de su largo. */
  racks: { x: number; y: number; largo: number; ancho: number; orientacion: "N-S" | "E-O" }[];
  zonas: { nombre: string; tipo: string; x: number; y: number; largo: number; ancho: number }[];
  actualizado: string;
};

const MAX = { andenes: 500, racks: 1000, zonas: 200, contorno: 400, medida: 3000, texto: 80 };
const MUROS = new Set<Muro>(["N", "S", "E", "O"]);
const TIPOS = new Set<TipoAnden>(["anden", "rampa", "no_operativo"]);

const num = (v: unknown, min = -MAX.medida, max = MAX.medida) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null;
const texto = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX.texto) : "");
const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);

/**
 * Toma el JSON del planeador (con notas, confianza y etiquetas) y deja solo lo que dibuja la planta, validado:
 * medidas finitas dentro de ±3 km, textos cortos y topes de cantidad. Devuelve el error en español si no sirve.
 */
export function compactarDistribucion(crudo: unknown, hoy: string): { distribucion: Distribucion } | { error: string } {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return { error: "El archivo no es una distribución." };
  const j = crudo as Record<string, unknown>;
  const nave = (j.nave ?? {}) as Record<string, unknown>;
  const largo = num(nave.largo, 1), ancho = num(nave.ancho, 1);
  if (!largo || !ancho) return { error: "La distribución no trae el largo y el ancho de la nave." };

  const contorno: unknown[] = Array.isArray(nave.contorno) ? nave.contorno : [];
  const puntos = contorno.flatMap((p) => {
    const x = Array.isArray(p) ? num(p[0]) : null, y = Array.isArray(p) ? num(p[1]) : null;
    return x === null || y === null ? [] : [[x, y] as [number, number]];
  });
  if (puntos.length > MAX.contorno) return { error: `El contorno trae más de ${MAX.contorno} puntos.` };

  const andenes: Distribucion["andenes"] = [];
  for (const a of lista(j.andenes)) {
    const tipo = (TIPOS.has(a.tipo as TipoAnden) ? a.tipo : "anden") as TipoAnden;
    const muro = a.muro as Muro, x = num(a.x), y = num(a.y), anch = num(a.ancho, 0.5, 20), n = num(a.num, 0, 10000);
    if (!MUROS.has(muro) || x === null || y === null || anch === null || n === null) continue;
    andenes.push({ num: n, tipo, muro, x, y, ancho: anch });
  }
  const racks: Distribucion["racks"] = [];
  for (const r of lista(j.racks)) {
    const x = num(r.x), y = num(r.y), l = num(r.largo, 0.1), a = num(r.ancho, 0.1);
    if (x === null || y === null || l === null || a === null) continue;
    racks.push({ x, y, largo: l, ancho: a, orientacion: r.orientacion === "N-S" ? "N-S" : "E-O" });
  }
  const zonas: Distribucion["zonas"] = [];
  for (const z of lista(j.zonas)) {
    const x = num(z.x), y = num(z.y), l = num(z.largo, 0.1), a = num(z.ancho, 0.1);
    if (x === null || y === null || l === null || a === null) continue;
    zonas.push({ nombre: texto(z.nombre) || "Zona", tipo: texto(z.tipo) || "otro", x, y, largo: l, ancho: a });
  }
  if (andenes.length > MAX.andenes || racks.length > MAX.racks || zonas.length > MAX.zonas) {
    return { error: `Demasiados elementos (máximo ${MAX.andenes} andenes, ${MAX.racks} racks y ${MAX.zonas} zonas).` };
  }
  if (!andenes.length && !racks.length) return { error: "La distribución no trae andenes ni racks." };

  return {
    distribucion: {
      v: 1, fuente: j.fuente === "PDF" ? "PDF" : "DXF",
      nave: { largo, ancho, ...(puntos.length >= 3 ? { contorno: puntos } : {}) },
      andenes, racks, zonas, actualizado: hoy,
    },
  };
}

/** Andenes que operan (de carga y rampas), para la ficha y los conteos. */
export const andenesQueOperan = (d: Distribucion) => d.andenes.filter((a) => a.tipo !== "no_operativo").length;
