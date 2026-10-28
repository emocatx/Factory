// Plantilla de nave: con una ficha corta por almacén (andenes, pasillos y qué zonas tiene) se arma su
// distribución completa, sin dibujar plano por plano. La ficha puede salir de las ubicaciones técnicas
// de SAP (contando AND###, PAS### y viendo qué zonas existen) o de un formulario en la configuración.
// Coordenadas en metros: x de poniente a oriente, z de norte (andenes) a sur; el centro de la nave es 0,0.
import type { TipoEquipo } from "@/components/home/Equipos3D";

export type Zona = "taller" | "carga" | "refacciones" | "soldadura" | "oficinas" | "banos" | "osmosis" | "carcamo" | "subestacion" | "tarimas";

export type FichaAlmacen = {
  id: string;
  nombre: string;
  andenes: number;
  /** Andenes solo al norte o en ambos lados (norte y sur). */
  dosLados: boolean;
  pasillos: number;
  zonas: Partial<Record<Zona, boolean>>;
  /** Activos registrados (en la app real salen de la tabla de equipos con su categoría y ubicación). */
  flota: Record<TipoEquipo, number>;
  minisplits: number;
  tableros: number;
  compresores: number;
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
export type Anden = { x: number; z: number; norte: boolean; estado: Estado };
/** Ruta de un equipo que opera: ida y vuelta en su pasillo, o circuito cerrado en embarque (todos en el mismo
 *  sentido y separados, así nunca se enciman). */
export type Ruta =
  | { tipo: "pasillo"; desde: number; hasta: number; fase: number }
  | { tipo: "circuito"; x0: number; x1: number; za: number; zb: number; s0: number };
export type Montacargas = { id: string; tipo: TipoEquipo; estado: Estado; x: number; z: number; rot: number; ruta?: Ruta };
export type Activo = { id: string; categoria: Categoria; estado: Estado; x: number; z: number; rot?: number };

export type Distribucion = {
  ancho: number; fondo: number;
  zonas: ZonaPiso[]; racks: Rack[]; andenes: Anden[];
  montacargas: Montacargas[]; activos: Activo[];
  /** Puntos para las etiquetas de zona. */
  etiquetas: { texto: string; x: number; z: number; y?: number }[];
};

/** Pseudoaleatorio estable: la misma ficha siempre da la misma escena. */
function azar(...n: number[]) {
  const x = Math.sin(n.reduce((a, b, i) => a + b * (12.9898 + i * 78.233), 0)) * 43758.5453;
  return x - Math.floor(x);
}

const PASO_ANDEN = 5.05;   // m entre andenes (CDN 5: 57 andenes en 288 m)
const EMBARQUE = 18;       // franja de embarque detrás de los andenes
const FONDO_RACKS = 86;    // largo de los pasillos de racks
const FRANJA_SUR = 18;     // mantenimiento y oficinas (sur) cuando los andenes van solo al norte
const ANCHO_EXTREMO = 42;  // mantenimiento al oriente y oficinas al poniente cuando hay andenes en ambos lados

export function distribuir(f: FichaAlmacen): Distribucion {
  const porLado = f.dosLados ? Math.ceil(f.andenes / 2) : f.andenes;
  const anchoAndenes = porLado * PASO_ANDEN;
  const extremos = f.dosLados ? ANCHO_EXTREMO * 2 : 0;
  const ancho = Math.max(anchoAndenes + extremos, f.pasillos * 7 + extremos);
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
    const paso = largo / n;
    for (let i = 0; i < n; i++) {
      const h = azar(i, norte ? 1 : 2, f.andenes);
      andenes.push({ x: ax0 + (i + 0.5) * paso, z: norte ? z0 : z1, norte, estado: h < 0.05 ? "paro" : "ok" });
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
  const paso = (rx1 - rx0) / f.pasillos;
  // oficina de operaciones como isla al centro, arriba (CDN 5)
  const islaX = rx0 + (rx1 - rx0) * 0.42, islaW = 26, islaD = 16;
  zona({ id: "operaciones", nombre: "Oficina operaciones", x: islaX, z: rz0, w: islaW, d: islaD, tono: "oficina" });
  for (let i = 0; i <= f.pasillos; i++) {
    const x = rx0 + i * paso;
    const enIsla = x > islaX - 2 && x < islaX + islaW + 2;
    racks.push({ x, z: enIsla ? rz0 + islaD + 2 : rz0, largo: enIsla ? rz1 - rz0 - islaD - 2 : rz1 - rz0 });
  }

  // Mantenimiento, oficinas e instalaciones
  const mz0 = f.dosLados ? z0 + EMBARQUE + 2 : rz1 + 3;
  const md = f.dosLados ? FONDO_RACKS - 4 : FRANJA_SUR - 4;
  const activos: Activo[] = [];
  const slotsTaller: { x: number; z: number }[] = [];
  if (f.dosLados) {
    // oriente: mantenimiento apilado; poniente: oficinas y baños
    let z = mz0;
    const bloque = (id: Zona, nombre: string, d: number, tono: ZonaPiso["tono"]) => {
      if (!f.zonas[id]) return null;
      const r = { id, nombre, x: x1 - ANCHO_EXTREMO + 2, z, w: ANCHO_EXTREMO - 4, d, tono };
      zona(r); z += d + 2; return r;
    };
    const t = bloque("taller", "Taller de mantenimiento", 34, "taller");
    const c = bloque("carga", "Carga de baterías", 20, "carga");
    bloque("refacciones", "Refacciones", 12, "neutro");
    if (t) for (let i = 0; i < 12; i++) slotsTaller.push({ x: t.x + 4 + (i % 4) * 9, z: t.z + 7 + Math.floor(i / 4) * 10 });
    if (c) for (let i = 0; i < 24; i++) activos.push({ id: `car${i}`, categoria: "cargador", estado: azar(i, 7) < 0.06 ? "paro" : "ok", x: c.x + 3 + (i % 12) * 3, z: c.z + 4 + Math.floor(i / 12) * 10 });
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
    const t = bloque("taller", "Taller de mantenimiento", 44, "taller");
    if (t) for (let i = 0; i < 12; i++) slotsTaller.push({ x: t.x + 4 + (i % 6) * 7.2, z: t.z + 3.5 + Math.floor(i / 6) * 6.5 });
    if (c) for (let i = 0; i < 26; i++) activos.push({ id: `car${i}`, categoria: "cargador", estado: azar(i, 7) < 0.06 ? "paro" : "ok", x: c.x + 1.5 + (i % 13) * 2.2, z: c.z + 2 + Math.floor(i / 13) * 9 });
    let xo = x0 + 2;
    if (f.zonas.oficinas) { zona({ id: "oficinas", nombre: "Oficinas", x: xo, z: mz0, w: 40, d: md, tono: "oficina" }); xo += 42; }
    if (f.zonas.banos) zona({ id: "banos", nombre: "Baños y vestidores", x: xo, z: mz0, w: 24, d: md, tono: "oficina" });
  }

  // Instalaciones fuera de la nave (patio sur o poniente)
  const patioZ = z1 + 8;
  let px = x0 + ancho * 0.25;
  if (f.zonas.osmosis) { activos.push({ id: "osm", categoria: "osmosis", estado: "ok", x: px, z: patioZ }); etiquetas.push({ texto: "Ósmosis", x: px, z: patioZ + 7 }); px += 22; }
  if (f.zonas.carcamo) { activos.push({ id: "car", categoria: "carcamo", estado: "paro", x: px, z: patioZ }); etiquetas.push({ texto: "Cárcamo", x: px, z: patioZ + 7 }); px += 16; }
  if (f.zonas.subestacion) { activos.push({ id: "sub", categoria: "subestacion", estado: "ok", x: x1 - 20, z: patioZ }); etiquetas.push({ texto: "Subestación", x: x1 - 20, z: patioZ + 7 }); }
  for (let i = 0; i < f.compresores; i++) activos.push({ id: `cmp${i}`, categoria: "compresor", estado: "ok", x: x1 - 40 - i * 7, z: patioZ });
  // tableros eléctricos repartidos en el muro sur
  for (let i = 0; i < f.tableros; i++) activos.push({ id: `tab${i}`, categoria: "tablero", estado: i === 2 ? "paro" : "ok", x: x0 + ((i + 0.5) / f.tableros) * ancho, z: z1 - 1.2 });
  // minisplits en oficinas y baños
  const ofis = zonas.filter((z) => z.tono === "oficina");
  for (let i = 0; i < f.minisplits; i++) {
    const o = ofis[i % Math.max(1, ofis.length)];
    if (!o) break;
    const k = Math.floor(i / ofis.length);
    activos.push({ id: `ms${i}`, categoria: "minisplit", estado: azar(i, 3) < 0.15 ? "paro" : "ok", x: o.x + 3 + (k * 7) % (o.w - 4), z: o.z + 1.5 + Math.floor((k * 7) / (o.w - 4)) * 5 });
  }

  // Montacargas: los de Mantto en el taller; los demás circulan por pasillos y embarque
  const montacargas: Montacargas[] = [];
  const tipos = (Object.keys(f.flota) as TipoEquipo[]).flatMap((t) => Array.from({ length: f.flota[t] }, () => t));
  let enTaller = 0, k = 0, e = 0;
  const nEmbarque = tipos.filter((t) => t !== "reach" && t !== "doble").length;
  tipos.forEach((tipo, i) => {
    const h = azar(i, 11, f.andenes);
    const estado: Estado = h < 0.11 && enTaller < slotsTaller.length ? "paro" : h > 0.96 ? "renta" : "ok";
    if (estado === "paro") {
      const s = slotsTaller[enTaller++];
      montacargas.push({ id: `m${i}`, tipo, estado, x: s.x, z: s.z, rot: Math.PI / 2 });
      return;
    }
    // reach y doble fondo trabajan en pasillos; contrapeso y patines en embarque
    if (tipo === "reach" || tipo === "doble") {
      const p = (k * 7) % f.pasillos; k++;
      const x = rx0 + (p + 0.5) * paso;
      montacargas.push({ id: `m${i}`, tipo, estado, x, z: rz0, rot: Math.PI / 2, ruta: { tipo: "pasillo", desde: rz0 + 3, hasta: rz1 - 3, fase: h * Math.PI * 2 } });
    } else {
      const norte = !f.dosLados || e % 2 === 0;
      const za = norte ? z0 + 6 : z1 - 13, zb = za + 7;
      const perimetro = 2 * (rx1 - rx0 - 12) + 2 * (zb - za);
      montacargas.push({ id: `m${i}`, tipo, estado, x: 0, z: za, rot: 0, ruta: { tipo: "circuito", x0: rx0 + 6, x1: rx1 - 6, za, zb, s0: (e * perimetro) / Math.max(1, nEmbarque) } });
      e++;
    }
  });

  etiquetas.push({ texto: `${f.pasillos} pasillos de racks`, x: (rx0 + rx1) / 2 + ancho * 0.18, z: (rz0 + rz1) / 2 });
  return { ancho, fondo, zonas, racks, andenes, montacargas, activos, etiquetas };
}
