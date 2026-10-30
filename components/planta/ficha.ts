// Plantilla de nave: con una ficha corta por almacén (andenes, pasillos y qué zonas tiene) se arma su
// distribución completa, sin dibujar plano por plano. La ficha puede salir de las ubicaciones técnicas
// de SAP (contando AND###, PAS### y viendo qué zonas existen) o de un formulario en la configuración.
// Coordenadas en metros: x de poniente a oriente, z de norte (andenes) a sur; el centro de la nave es 0,0.
import type { TipoEquipo } from "@/components/home/Equipos3D";
import { categoriaDe, normalizar } from "@/lib/planAnual";

/**
 * Ficha de una nave como llega del servidor: la de `almacenes.ficha` (la llena el programa anual o, después, un
 * formulario; manda sobre todo) o la que se deriva de los equipos registrados del almacén (`fichaDesdeEquipos`).
 * Los conteos de activos (compresores, tableros, minisplits, cargadores) solo vienen en la derivada.
 */
export type FichaNave = {
  andenes?: number; pasillos?: number; zonas?: string[];
  techo?: { louvers?: number; extractores?: number; inyectores?: number };
  compresores?: number; tableros?: number; minisplits?: number; cargadores?: number;
  fuente?: string; actualizado?: string;
};

/** Lo mínimo de un equipo para derivar la ficha: su nombre (denominación) y su categoría si la tiene. */
export type EquipoNombre = { nombre: string; categoria: string | null };

/**
 * Ficha derivada de los equipos registrados de un almacén, con las mismas reglas que el lector del programa
 * anual (lib/planAnual.ts, armarLectura): andenes = activos "Andén XXX n", pasillos = "pasillo N" distintos,
 * zonas = categorías presentes (taller, oficina, baño, vestidor, comedor; ósmosis, cárcamo, subestación y
 * cargadores de otros pilares) y techo = louvers, extractores e inyectores. Sin andenes ni pasillos: null (no
 * describe la nave; se estima con la flota).
 */
export function fichaDesdeEquipos(equipos: EquipoNombre[]): FichaNave | null {
  const n = equipos.map((e) => ({ d: normalizar(e.nombre), c: e.categoria ?? categoriaDe(e.nombre) }));
  const andenes = n.filter((e) => /^anden [a-z]{2,6} ?\d+/.test(e.d)).length;
  const pasillos = new Set(n.flatMap((e) => { const m = e.d.match(/\bpasillo (\d+)/); return m ? [Number(m[1])] : []; })).size;
  if (!andenes && !pasillos) return null;
  const hay = (c: string) => n.some((e) => e.c === c);
  const cuenta = (f: (e: { d: string; c: string }) => boolean) => n.filter(f).length;
  const zonas = ["taller", "oficina", "bano", "vestidor", "comedor", "osmosis", "carcamo"].filter(hay);
  if (n.some((e) => /subestacion/.test(e.d))) zonas.push("subestacion");
  const cargadores = cuenta((e) => e.c === "cargador");
  if (cargadores) zonas.push("carga");
  return {
    andenes, pasillos, zonas, cargadores,
    techo: { louvers: cuenta((e) => e.c === "louver"), extractores: cuenta((e) => e.c === "extractor"), inyectores: cuenta((e) => e.c === "inyector") },
    compresores: cuenta((e) => e.c === "compresor"), tableros: cuenta((e) => /tablero/.test(e.d)), minisplits: cuenta((e) => e.c === "climatizacion"),
    fuente: "equipos",
  };
}

export type Zona = "taller" | "carga" | "refacciones" | "soldadura" | "oficinas" | "banos" | "osmosis" | "carcamo" | "subestacion" | "tarimas";

export type FichaAlmacen = {
  id: string;
  nombre: string;
  andenes: number;
  /** Andenes solo al norte o en ambos lados (norte y sur). */
  dosLados: boolean;
  pasillos: number;
  zonas: Partial<Record<Zona, boolean>>;
  /** Flota inventada del prototipo; en el Resumen la flota son los equipos reales del almacén. */
  flota?: Record<TipoEquipo, number>;
  minisplits: number;
  tableros: number;
  compresores: number;
  /** Cargadores de baterías registrados (si no se sabe, los de la plantilla). */
  cargadores?: number;
  /** De dónde salió: "programa-anual", "equipos", "estimada" (por tamaño de flota) o vacío en las muestras. */
  fuente?: string;
};

export type Categoria = "montacargas" | "cargador" | "minisplit" | "osmosis" | "carcamo" | "tablero" | "compresor" | "subestacion" | "anden" | "rack";
export type Pilar = "moviles" | "criticos" | "inmuebles";
/** A qué pilar va cada categoría: configuración de la empresa (en CAB así; otra empresa puede no tener pilares). */
export const PILAR_DE: Record<Categoria, Pilar> = {
  montacargas: "moviles", cargador: "moviles",
  osmosis: "criticos", carcamo: "criticos", tablero: "criticos", compresor: "criticos", subestacion: "criticos",
  minisplit: "inmuebles", anden: "inmuebles", rack: "inmuebles",
};
export type Estado = "ok" | "paro" | "renta";

export const FICHAS: FichaAlmacen[] = [
  {
    id: "cdn5", nombre: "CDN 5 · Tlajomulco", andenes: 57, dosLados: false, pasillos: 35,
    zonas: { taller: true, carga: true, refacciones: true, soldadura: true, oficinas: true, banos: true, osmosis: true, carcamo: true, subestacion: true, tarimas: true },
    flota: { contrapeso: 14, reach: 26, doble: 8, patin: 18 }, minisplits: 14, tableros: 8, compresores: 2,
  },
  {
    id: "ejemplo", nombre: "CDN ejemplo · 77 andenes, sin ósmosis", andenes: 77, dosLados: true, pasillos: 30,
    zonas: { taller: true, carga: true, refacciones: true, oficinas: true, banos: true, subestacion: true },
    flota: { contrapeso: 10, reach: 20, doble: 4, patin: 14 }, minisplits: 8, tableros: 6, compresores: 1,
  },
];

type Rect = { x: number; z: number; w: number; d: number };
export type ZonaPiso = Rect & { id: string; nombre: string; tono: "embarque" | "recepcion" | "taller" | "carga" | "oficina" | "patio" | "tarimas" | "neutro"; pilar?: Pilar };
export type Rack = { x: number; z: number; largo: number };
/** `estado` vacío = sin dato: se dibuja neutro y sin luz de estado (con datos reales nada se inventa). */
export type Anden = { x: number; z: number; norte: boolean; estado?: Estado };
/** Ruta de un equipo que opera: ida y vuelta en su pasillo, o circuito cerrado en embarque (todos en el mismo
 *  sentido y separados, así nunca se enciman). */
export type Ruta =
  | { tipo: "pasillo"; desde: number; hasta: number; fase: number }
  | { tipo: "circuito"; x0: number; x1: number; za: number; zb: number; s0: number };
export type Montacargas = { id: string; tipo: TipoEquipo; estado: Estado; x: number; z: number; rot: number; ruta?: Ruta };
export type Activo = { id: string; categoria: Categoria; estado?: Estado; x: number; z: number; rot?: number };
/** Un equipo de la flota: tipo (según su modelo) y estado. */
export type EquipoFlota = { tipo: TipoEquipo; estado: Estado };

export type Distribucion = {
  ancho: number; fondo: number;
  zonas: ZonaPiso[]; racks: Rack[]; andenes: Anden[];
  montacargas: Montacargas[]; activos: Activo[];
  /** Puntos para las etiquetas de zona. */
  etiquetas: { texto: string; x: number; z: number; y?: number }[];
  /** Rectángulo de todo lo que se dibuja (nave, tráileres y patio), para encuadrar y centrar. */
  huella: { cx: number; cz: number; ancho: number; fondo: number };
  /** Equipos en Mantto que no caben en los cajones del taller (no se dibujan; la marca del taller sí los cuenta). */
  sinLugar: number;
};

// ── Ficha de la base (almacenes.ficha) → ficha de la plantilla ─────────────────────────────────────
/** Zonas que puede traer la ficha de la base (programa anual hoy; formulario después) y su zona en la plantilla. */
const ZONA_DE_BASE: Record<string, Zona> = {
  taller: "taller", oficina: "oficinas", oficinas: "oficinas", bano: "banos", banos: "banos", vestidor: "banos",
  carga: "carga", refacciones: "refacciones", soldadura: "soldadura", osmosis: "osmosis", carcamo: "carcamo",
  subestacion: "subestacion", tarimas: "tarimas",
};

/**
 * Ficha guardada en la base → ficha de la plantilla. Lo que la base no dice toma un valor por omisión claro:
 * andenes de un solo lado (norte), sin minisplits, tableros ni compresores (no se inventan activos) y siempre
 * con taller, porque en Móviles ahí se dibujan los equipos en Mantto. "comedor" y el techo (louvers,
 * extractores, inyectores) todavía no tienen pieza en la plantilla. Sin andenes ni pasillos no hay nave (null).
 */
export function fichaDeBase(id: string, nombre: string, base: FichaNave): FichaAlmacen | null {
  const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(300, Math.round(v)) : 0);
  const andenes = entero(base.andenes), pasillos = entero(base.pasillos);
  if (!andenes && !pasillos) return null;
  const zonas: FichaAlmacen["zonas"] = { taller: true };
  for (const z of Array.isArray(base.zonas) ? base.zonas : []) {
    const k = typeof z === "string" ? ZONA_DE_BASE[z] : undefined;
    if (k) zonas[k] = true;
  }
  const tope = (v: unknown, max: number) => Math.min(max, entero(v));
  return { id, nombre, andenes, dosLados: andenes > ANDENES_DOS_LADOS, pasillos, zonas, minisplits: tope(base.minisplits, 40), tableros: tope(base.tableros, 30), compresores: tope(base.compresores, 6), cargadores: tope(base.cargadores, 52) || undefined, fuente: base.fuente };
}

/**
 * Ficha ESTIMADA (fuente "estimada") para un almacén del que solo se conoce su flota de Móviles: el tamaño sale de
 * la proporción de CDN 5 (55 equipos, 35 pasillos, 57 andenes), con mínimos de 6 andenes y 4 pasillos, y solo
 * taller. Se reemplaza sola cuando el almacén tenga ficha en la base o activos de Inmueble con andenes y pasillos.
 */
export function fichaEstimada(id: string, nombre: string, equipos: number): FichaAlmacen {
  const andenes = Math.max(6, Math.min(120, Math.round(equipos * 1.04)));
  const pasillos = Math.max(4, Math.min(60, Math.round(equipos * 0.64)));
  return { id, nombre, andenes, dosLados: andenes > ANDENES_DOS_LADOS, pasillos, zonas: { taller: true }, minisplits: 0, tableros: 0, compresores: 0, fuente: "estimada" };
}

/**
 * TEMPORAL (solo en desarrollo): CDN 5 de CAB se arma con la ficha de muestra `cdn5` mientras su
 * `almacenes.ficha` esté vacía. Quitar cuando se cargue el programa anual de Inmueble.
 */
const MUESTRA_DEV: Record<string, string> = { "5b8d915a-d0e0-440d-b077-34807e06eb4f": "cdn5" };

/**
 * Ficha con la que se arma la nave de un almacén. Prioridad: la del servidor (`almacenes.ficha` o la derivada de
 * sus equipos) → en desarrollo, la muestra de CDN 5 → estimada con el tamaño de su flota. null solo sin equipos
 * (se dibuja el interior genérico).
 */
export function fichaDeAlmacen(a: { id: string; nombre: string; total: number; ficha?: FichaNave | null }): FichaAlmacen | null {
  const base = a.ficha ? fichaDeBase(a.id, a.nombre, a.ficha) : null;
  if (base) return base;
  const muestra = process.env.NODE_ENV !== "production" ? FICHAS.find((f) => f.id === MUESTRA_DEV[a.id]) : undefined;
  if (muestra) return { ...muestra, nombre: a.nombre };
  return a.total > 0 ? fichaEstimada(a.id, a.nombre, a.total) : null;
}

/** Posición y giro [x, z, rotY] de un equipo a los t segundos de animación. */
export function pose(m: Montacargas, t: number): [number, number, number] {
  const r = m.ruta;
  if (!r) return [m.x, m.z, m.rot];
  if (r.tipo === "pasillo") {
    const a = t * 0.12 + r.fase;
    return [m.x, r.desde + (r.hasta - r.desde) * (0.5 + 0.5 * Math.sin(a)), Math.cos(a) >= 0 ? -Math.PI / 2 : Math.PI / 2];
  }
  // circuito: carril norte hacia el oriente, carril sur hacia el poniente
  const L = r.x1 - r.x0, H = r.zb - r.za, P = 2 * L + 2 * H;
  let s = (((r.s0 + t * 3.2) % P) + P) % P;
  if (s < L) return [r.x0 + s, r.za, 0];
  if ((s -= L) < H) return [r.x1, r.za + s, -Math.PI / 2];
  if ((s -= H) < L) return [r.x1 - s, r.zb, Math.PI];
  s -= L;
  return [r.x0, r.zb - s, Math.PI / 2];
}

/** Pseudoaleatorio estable: la misma ficha siempre da la misma escena. */
function azar(...n: number[]) {
  const x = Math.sin(n.reduce((a, b, i) => a + b * (12.9898 + i * 78.233), 0)) * 43758.5453;
  return x - Math.floor(x);
}

const PASO_ANDEN = 5.05;   // m entre andenes (CDN 5: 57 andenes en 288 m)
const EMBARQUE = 18;       // franja de embarque detrás de los andenes
const FONDO_RACKS = 86;    // largo de los pasillos de racks
const FRANJA_SUR = 18;     // mantenimiento y oficinas (sur) cuando los andenes van solo al norte
const ANCHO_EXTREMO = 42;
/** Con más andenes que esto se reparten en los dos lados de la nave (la ficha no dice cuántos lados tiene). */
const ANDENES_DOS_LADOS = 40;  // mantenimiento al oriente y oficinas al poniente cuando hay andenes en ambos lados

/**
 * Distribución completa de la nave. Con `flotaReal` (Resumen) los montacargas son los equipos del almacén y los
 * demás activos van sin estado (no hay dato); sin ella (prototipo) se inventan flota y estados de muestra.
 */
export function distribuir(f: FichaAlmacen, flotaReal?: EquipoFlota[]): Distribucion {
  const inventar = !flotaReal;
  // El taller crece para que quepan todos los equipos en Mantto (cajones de 3 × 4 m)
  const nMantto = (flotaReal ?? inventada(f)).filter((e) => e.estado === "paro").length;
  const filasSur = Math.max(1, Math.floor((FRANJA_SUR - 4 - 2) / 4));
  const anchoTaller = Math.max(44, Math.ceil(nMantto / filasSur) * 3 + 2);
  const colsExtremo = Math.max(1, Math.floor((ANCHO_EXTREMO - 4 - 2) / 3));
  const fondoTaller = Math.min(FONDO_RACKS - 40, Math.max(34, Math.ceil(nMantto / colsExtremo) * 4 + 2));
  const porLado = f.dosLados ? Math.ceil(f.andenes / 2) : f.andenes;
  const anchoAndenes = porLado * PASO_ANDEN;
  const extremos = f.dosLados ? ANCHO_EXTREMO * 2 : 0;
  // lo mínimo para que quepan las zonas del sur cuando la ficha trae pocos andenes y pasillos
  const SUR: [Zona, number][] = [["taller", anchoTaller + 2], ["carga", 32], ["refacciones", 14], ["soldadura", 18], ["oficinas", 42], ["banos", 26]];
  const anchoSur = f.dosLados ? 0 : 6 + SUR.reduce((a, [z, w]) => a + (f.zonas[z] ? w : 0), 0);
  const ancho = Math.max(anchoAndenes + extremos, f.pasillos * 7 + extremos, anchoSur, 60);
  const fondo = EMBARQUE + FONDO_RACKS + (f.dosLados ? EMBARQUE : FRANJA_SUR);
  const x0 = -ancho / 2, z0 = -fondo / 2, x1 = ancho / 2, z1 = fondo / 2;
  const zonas: ZonaPiso[] = [];
  const etiquetas: Distribucion["etiquetas"] = [];
  // las oficinas son bloques: su etiqueta va sobre el techo
  const zona = (z: ZonaPiso, etiqueta = true) => { zonas.push(z); if (etiqueta) etiquetas.push({ texto: z.nombre, x: z.x + z.w / 2, z: z.z + z.d / 2, y: z.tono === "oficina" ? 2.7 : undefined }); };

  // Zona de racks entre las franjas
  const rx0 = x0 + (f.dosLados ? ANCHO_EXTREMO : 0) + 2;
  const rx1 = x1 - (f.dosLados ? ANCHO_EXTREMO : 0) - 2;
  const rz0 = z0 + EMBARQUE + 2;
  const rz1 = rz0 + FONDO_RACKS - 4;

  // Embarque y andenes
  const lados = f.dosLados ? [true, false] : [true];
  const andenes: Anden[] = [];
  for (const norte of lados) {
    const zEmb = norte ? z0 : z1 - EMBARQUE;
    const ax0 = (f.dosLados ? x0 + ANCHO_EXTREMO : x0);
    const largo = f.dosLados ? ancho - ANCHO_EXTREMO * 2 : ancho;
    // surtido a los lados y recepción al centro (como en CDN 5)
    const recep = largo * 0.18;
    zona({ id: `surtido-a-${norte}`, nombre: "Embarque · surtido", x: ax0, z: zEmb, w: (largo - recep) / 2, d: EMBARQUE, tono: "embarque" });
    zona({ id: `recepcion-${norte}`, nombre: "Recepción", x: ax0 + (largo - recep) / 2, z: zEmb, w: recep, d: EMBARQUE, tono: "recepcion" });
    zona({ id: `surtido-b-${norte}`, nombre: "Embarque · surtido", x: ax0 + (largo + recep) / 2, z: zEmb, w: (largo - recep) / 2, d: EMBARQUE, tono: "embarque" }, false);
    const n = norte ? porLado : f.andenes - porLado;
    const paso = largo / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const h = azar(i, norte ? 1 : 2, f.andenes);
      andenes.push({ x: ax0 + (i + 0.5) * paso, z: norte ? z0 : z1, norte, estado: inventar ? (h < 0.05 ? "paro" : "ok") : undefined });
    }
  }
  if (f.zonas.tarimas && !f.dosLados) {
    // reabasto de tarimas en la esquina norponiente, dentro de la franja de embarque
    zonas.find((z) => z.id === "surtido-a-true")!.x += 30;
    zonas.find((z) => z.id === "surtido-a-true")!.w -= 30;
    zona({ id: "tarimas", nombre: "Tarimas", x: x0, z: z0, w: 30, d: EMBARQUE, tono: "tarimas" });
  }

  // Pasillos de racks: un rack de doble fondo por pasillo, con su pasillo de circulación
  const racks: Rack[] = [];
  const paso = (rx1 - rx0) / Math.max(1, f.pasillos);
  // oficina de operaciones como isla al centro, arriba (CDN 5)
  const islaX = rx0 + (rx1 - rx0) * 0.42, islaW = 26, islaD = 16;
  zona({ id: "operaciones", nombre: "Oficina operaciones", x: islaX, z: rz0, w: islaW, d: islaD, tono: "oficina" });
  for (let i = 0; f.pasillos > 0 && i <= f.pasillos; i++) {
    const x = rx0 + i * paso;
    const enIsla = x > islaX - 2 && x < islaX + islaW + 2;
    racks.push({ x, z: enIsla ? rz0 + islaD + 2 : rz0, largo: enIsla ? rz1 - rz0 - islaD - 2 : rz1 - rz0 });
  }

  // Mantenimiento, oficinas e instalaciones
  const mz0 = f.dosLados ? z0 + EMBARQUE + 2 : rz1 + 3;
  const md = f.dosLados ? FONDO_RACKS - 4 : FRANJA_SUR - 4;
  const activos: Activo[] = [];
  let taller: ZonaPiso | null = null;
  const estadoDe = (h: number, umbral: number): Estado | undefined => (inventar ? (h < umbral ? "paro" : "ok") : undefined);
  if (f.dosLados) {
    // oriente: mantenimiento apilado; poniente: oficinas y baños
    let z = mz0;
    const bloque = (id: Zona, nombre: string, d: number, tono: ZonaPiso["tono"]) => {
      if (!f.zonas[id]) return null;
      const r = { id, nombre, x: x1 - ANCHO_EXTREMO + 2, z, w: ANCHO_EXTREMO - 4, d, tono };
      zona(r); z += d + 2; return r;
    };
    const t = bloque("taller", "Taller de mantenimiento", fondoTaller, "taller");
    const c = bloque("carga", "Carga de baterías", 20, "carga");
    bloque("refacciones", "Refacciones", 12, "neutro");
    taller = t;
    if (c) for (let i = 0; i < (f.cargadores ?? 24); i++) activos.push({ id: `car${i}`, categoria: "cargador", estado: estadoDe(azar(i, 7), 0.06), x: c.x + 3 + (i % 12) * 3, z: c.z + 4 + Math.floor(i / 12) * 10 });
    let zo = mz0;
    if (f.zonas.oficinas) { zona({ id: "oficinas", nombre: "Oficinas", x: x0 + 2, z: zo, w: ANCHO_EXTREMO - 4, d: 40, tono: "oficina" }); zo += 42; }
    if (f.zonas.banos) zona({ id: "banos", nombre: "Baños y vestidores", x: x0 + 2, z: zo, w: ANCHO_EXTREMO - 4, d: 22, tono: "oficina" });
  } else {
    // sur: oficinas al poniente, mantenimiento al oriente (como CDN 5)
    let x = x1 - 2;
    const bloque = (id: Zona, nombre: string, w: number, tono: ZonaPiso["tono"]) => {
      if (!f.zonas[id]) return null;
      x -= w; const r = { id, nombre, x, z: mz0, w, d: md, tono };
      zona(r); x -= 2; return r;
    };
    bloque("soldadura", "Soldadura y pintura", 16, "neutro");
    bloque("refacciones", "Refacciones", 12, "neutro");
    const c = bloque("carga", "Carga de baterías", 30, "carga");
    const t = bloque("taller", "Taller de mantenimiento", anchoTaller, "taller");
    taller = t;
    if (c) for (let i = 0; i < (f.cargadores ?? 26); i++) activos.push({ id: `car${i}`, categoria: "cargador", estado: estadoDe(azar(i, 7), 0.06), x: c.x + 1.5 + (i % 13) * 2.2, z: c.z + 2 + Math.floor(i / 13) * 9 });
    let xo = x0 + 2;
    if (f.zonas.oficinas) { zona({ id: "oficinas", nombre: "Oficinas", x: xo, z: mz0, w: 40, d: md, tono: "oficina" }); xo += 42; }
    if (f.zonas.banos) zona({ id: "banos", nombre: "Baños y vestidores", x: xo, z: mz0, w: 24, d: md, tono: "oficina" });
  }

  // Instalaciones fuera de la nave (patio sur o poniente)
  const patioZ = z1 + 8;
  let px = x0 + ancho * 0.25;
  if (f.zonas.osmosis) { activos.push({ id: "osm", categoria: "osmosis", estado: inventar ? "ok" : undefined, x: px, z: patioZ }); etiquetas.push({ texto: "Ósmosis", x: px, z: patioZ + 7 }); px += 22; }
  if (f.zonas.carcamo) { activos.push({ id: "car", categoria: "carcamo", estado: inventar ? "paro" : undefined, x: px, z: patioZ }); etiquetas.push({ texto: "Cárcamo", x: px, z: patioZ + 7 }); px += 16; }
  if (f.zonas.subestacion) { activos.push({ id: "sub", categoria: "subestacion", estado: inventar ? "ok" : undefined, x: x1 - 20, z: patioZ }); etiquetas.push({ texto: "Subestación", x: x1 - 20, z: patioZ + 7 }); }
  for (let i = 0; i < f.compresores; i++) activos.push({ id: `cmp${i}`, categoria: "compresor", estado: inventar ? "ok" : undefined, x: x1 - 40 - i * 7, z: patioZ });
  // tableros eléctricos repartidos en el muro sur
  for (let i = 0; i < f.tableros; i++) activos.push({ id: `tab${i}`, categoria: "tablero", estado: inventar ? (i === 2 ? "paro" : "ok") : undefined, x: x0 + ((i + 0.5) / f.tableros) * ancho, z: z1 - 1.2 });
  // minisplits en oficinas y baños
  const ofis = zonas.filter((z) => z.tono === "oficina");
  for (let i = 0; i < f.minisplits; i++) {
    const o = ofis[i % Math.max(1, ofis.length)];
    if (!o) break;
    const k = Math.floor(i / ofis.length);
    activos.push({ id: `ms${i}`, categoria: "minisplit", estado: estadoDe(azar(i, 3), 0.15), x: o.x + 3 + (k * 7) % (o.w - 4), z: o.z + 1.5 + Math.floor((k * 7) / (o.w - 4)) * 5 });
  }

  // Montacargas: los de Mantto en los cajones del taller; los de pasillo (reach y doble fondo) van y vienen por su
  // pasillo, cada uno en su tramo; los demás circulan por el circuito de embarque, separados por igual.
  const flota = flotaReal ?? inventada(f);
  const montacargas: Montacargas[] = [];
  const enMantto = flota.filter((e) => e.estado === "paro");
  const cajones = taller ? cajonesDe(taller, enMantto.length, f.dosLados) : [];
  enMantto.slice(0, cajones.length).forEach((e, i) => montacargas.push({ id: `t${i}`, tipo: e.tipo, estado: "paro", x: cajones[i].x, z: cajones[i].z, rot: Math.PI / 2 }));
  const operan = flota.filter((e) => e.estado !== "paro");
  const dePasillo = f.pasillos > 0 ? operan.filter((e) => e.tipo === "reach" || e.tipo === "doble") : [];
  const deCircuito = operan.filter((e) => !dePasillo.includes(e));
  const P = f.pasillos, n = dePasillo.length;
  dePasillo.forEach((e, k) => {
    // n ≤ P: uno por pasillo, repartidos a lo ancho; n > P: varios por pasillo, cada uno en su tramo (nunca se cruzan)
    const p = n <= P ? Math.floor(((k + 0.5) * P) / n) : k % P;
    const tramos = n <= P ? 1 : Math.floor((n - 1 - p) / P) + 1;
    const s = n <= P ? 0 : Math.floor(k / P);
    const L = (rz1 - rz0 - 6) / tramos;
    const desde = rz0 + 3 + s * L, hasta = desde + L - (tramos > 1 ? 3 : 0);
    montacargas.push({ id: `p${k}`, tipo: e.tipo, estado: e.estado, x: rx0 + (p + 0.5) * paso, z: desde, rot: Math.PI / 2, ruta: { tipo: "pasillo", desde, hasta, fase: azar(k, 11) * Math.PI * 2 } });
  });
  const carriles = f.dosLados ? [true, false] : [true];
  carriles.forEach((norte, c) => {
    const lista = deCircuito.filter((_, k) => k % carriles.length === c);
    const za = norte ? z0 + 6 : z1 - 13, zb = za + 7;
    const perimetro = 2 * (rx1 - rx0 - 12) + 2 * (zb - za);
    lista.forEach((e, k) => montacargas.push({ id: `c${c}-${k}`, tipo: e.tipo, estado: e.estado, x: 0, z: za, rot: 0, ruta: { tipo: "circuito", x0: rx0 + 6, x1: rx1 - 6, za, zb, s0: (k * perimetro) / lista.length } }));
  });

  etiquetas.push({ texto: `${f.pasillos} pasillos de racks`, x: (rx0 + rx1) / 2 + ancho * 0.18, z: (rz0 + rz1) / 2 });
  // huella: la nave, los tráileres de los andenes (16 m) y el patio de instalaciones al sur
  const patioSur = activos.some((a) => ["osmosis", "carcamo", "subestacion", "compresor"].includes(a.categoria));
  const hz0 = z0 - (andenes.some((a) => a.norte) ? 17 : 3);
  const hz1 = z1 + (andenes.some((a) => !a.norte) || patioSur ? 17 : 3);
  const huella = { cx: 0, cz: (hz0 + hz1) / 2, ancho: ancho + 6, fondo: hz1 - hz0 };
  return { ancho, fondo, zonas, racks, andenes, montacargas, activos, etiquetas, huella, sinLugar: Math.max(0, enMantto.length - cajones.length) };
}

/** Cajones del taller: la rejilla de siempre (12) y, con más equipos en Mantto, una más apretada (3 × 4 m). */
function cajonesDe(t: ZonaPiso, n: number, dosLados: boolean): { x: number; z: number }[] {
  if (n <= 12) {
    return Array.from({ length: 12 }, (_, i) => dosLados
      ? { x: t.x + 4 + (i % 4) * 9, z: t.z + 7 + Math.floor(i / 4) * 10 }
      : { x: t.x + 4 + (i % 6) * 7.2, z: t.z + 3.5 + Math.floor(i / 6) * 6.5 });
  }
  const cols = Math.max(1, Math.floor((t.w - 2) / 3)), filas = Math.max(1, Math.floor((t.d - 2) / 4));
  const px = (t.w - 2) / cols, pz = (t.d - 2) / filas;
  return Array.from({ length: Math.min(n, cols * filas) }, (_, i) => ({ x: t.x + 1 + px * ((i % cols) + 0.5), z: t.z + 1 + pz * (Math.floor(i / cols) + 0.3) }));
}

/** Flota de muestra del prototipo: los conteos de la ficha con estados al azar (estables). */
function inventada(f: FichaAlmacen): EquipoFlota[] {
  const flota = f.flota ?? { contrapeso: 0, reach: 0, doble: 0, patin: 0 };
  const tipos = (Object.keys(flota) as TipoEquipo[]).flatMap((t) => Array.from({ length: flota[t] }, () => t));
  let paro = 0;
  return tipos.map((tipo, i) => {
    const h = azar(i, 11, f.andenes);
    const estado: Estado = h < 0.11 && paro < 12 ? "paro" : h > 0.96 ? "renta" : "ok";
    if (estado === "paro") paro++;
    return { tipo, estado };
  });
}
