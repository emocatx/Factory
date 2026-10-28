// Lector del "programa anual de mantenimiento preventivo" (formato CABLOMTO-F01): una fila por activo con
// almacén, número SAP, denominación y su plan por frecuencia (1M…12M), lanzamientos y horas.
// No guarda nada: convierte el Excel en activos, categorías, planes y fichas de almacén para revisarlos.
// Sirve igual para Infraestructura, Críticos o cualquier pilar que use el mismo formato.

export const FRECUENCIAS = ["1M", "2M", "3M", "4M", "6M", "12M"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export const DIAS_FRECUENCIA: Record<Frecuencia, number> = { "1M": 30, "2M": 61, "3M": 91, "4M": 122, "6M": 182, "12M": 365 };
export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  "1M": "mensual", "2M": "bimestral", "3M": "trimestral", "4M": "cuatrimestral", "6M": "semestral", "12M": "anual",
};

export const CATEGORIAS = {
  louver: "Louver", extractor: "Extractor", inyector: "Inyector", racks: "Racks", anden: "Andén", cortina: "Cortina o portón",
  puerta: "Puertas y salidas", taller: "Taller", vestidor: "Vestidores", bano: "Baños", comedor: "Comedor", oficina: "Oficinas",
  area: "Áreas operativas", estructura: "Muros y pisos", balizamiento: "Balizamiento", electrico: "Instalación eléctrica",
  hidraulico: "Instalación hidráulica", exterior: "Exterior y cubierta", jardineria: "Jardinería",
  limpieza: "Limpieza", pintura: "Pintura", otro: "Otro",
} as const;
export type Categoria = keyof typeof CATEGORIAS;

// El orden importa: primero el tipo de activo y después el tipo de trabajo ("Pintura andén" es un andén).
const REGLAS: [Categoria, RegExp][] = [
  ["louver", /louver/], ["extractor", /extractor/], ["inyector", /inyector/], ["racks", /\brack|proteccion/], ["anden", /\banden/],
  ["cortina", /cortina|porton/], ["puerta", /puerta|salida/], ["taller", /taller/], ["vestidor", /vestidor|lock/],
  ["bano", /\bbano|sanitari|mingitorio/], ["comedor", /comedor|cocineta/],
  ["oficina", /oficina|lobby|looby|sala de|archivo|recepcion|\bsite\b|sistemas|mobiliario/],
  ["area", /area tecnica|area de|seguridad patrimonial|modulo|mesa de control|sala friso|segregacion|volteador|dorsal|mezzanine|cargadores|caseta|almacen de/],
  ["estructura", /muro|junta|grieta|losa|loza|\bpiso/],
  ["balizamiento", /baliza|senal/], ["electrico", /electric|lum+inaria|tierras|centro de carga|regulador|planta de emergencia/],
  ["hidraulico", /agua|pozo|cisterna|hidroneumatico|bomba|tinaco|drenaje|fosa|septica/],
  ["exterior", /exterior|cubierta|techumbre|azotea|impermeab|bajante|canalon|malla|estacionamiento|bacheo|calafateo/],
  ["jardineria", /jardin|areas? verdes?|riego|poda/], ["limpieza", /limpieza|trampa/], ["pintura", /pintura|resane/],
];

/** Sin acentos, minúsculas y espacios simples (tolera "Revicion", "ANDÉN", dobles espacios…). */
export const normalizar = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function categoriaDe(denominacion: string): Categoria {
  const d = normalizar(denominacion);
  return REGLAS.find(([, r]) => r.test(d))?.[0] ?? "otro";
}

export type Activo = {
  fila: number;
  almacen: string;        // código del archivo (CDN1, MTY2, AGRO…)
  sap: string;
  /** Sin número SAP real: vacío o un consecutivo interno (1, 2, 3… menos de 4 dígitos). */
  sinSap: boolean;
  denominacion: string;
  categoria: Categoria;
  frecuencias: Frecuencia[];
  /** Código del plan en SAP por frecuencia (p. ej. 0004). */
  planes: Partial<Record<Frecuencia, string>>;
  lanzamientos: number | null;
  /** Horas por servicio ("tiempo por frecuencia"), sumando las frecuencias que tenga. */
  horas: number | null;
  /** Fechas programadas en el calendario semanal del archivo ("04 FEB 26 4M"), en orden. */
  programadas: { fecha: string; frecuencia: Frecuencia | null }[];
};

export type FichaArchivo = { almacen: string; activos: number; andenes: number; pasillos: number; zonas: Categoria[]; techo: { louvers: number; extractores: number; inyectores: number } };
export type PlanPropuesto = { nombre: string; categoria: Categoria; frecuencia: Frecuencia; cada_dias: number; activos: number; codigos: string[] };
export type Lectura = {
  hoja: string;
  activos: Activo[];
  fichas: FichaArchivo[];
  planes: PlanPropuesto[];
  problemas: { tipo: "sin-sap" | "sap-repetido" | "sin-frecuencia" | "ficha-incompleta"; texto: string }[];
};

type Celda = string | number | boolean | Date | null | undefined;

/** Encuentra los encabezados del formato (pueden moverse unas columnas o filas entre versiones). */
function columnas(tabla: Celda[][]) {
  const fEnc = tabla.findIndex((r) => r.some((c) => normalizar(c) === "denominacion"));
  if (fEnc < 0) return null;
  const enc = tabla[fEnc].map(normalizar);
  const den = enc.indexOf("denominacion");
  const num = enc.findIndex((h, i) => i < den && /^(n|no|n°|nº|numero|n\.?|no\.?)[°º.]?$/.test(h.replace(/\s/g, "")));
  const inicio = (txt: RegExp) => enc.findIndex((h) => txt.test(h));
  const gPlan = inicio(/plan de mantenimiento/), gLanz = inicio(/lanzamiento/), gTiempo = inicio(/tiempo por frecuencia/);
  // la fila con 1M, 2M… (arriba del encabezado) dice qué frecuencia es cada columna
  const fFrec = tabla.slice(0, fEnc + 1).findIndex((r) => r.filter((c) => FRECUENCIAS.includes(String(c ?? "").trim().toUpperCase() as Frecuencia)).length >= 3);
  const frec = (desde: number, hasta: number) => {
    const r: Partial<Record<Frecuencia, number>> = {};
    if (fFrec < 0 || desde < 0) return r;
    for (let i = desde; i < (hasta > desde ? hasta : desde + 6); i++) {
      const f = String(tabla[fFrec][i] ?? "").trim().toUpperCase() as Frecuencia;
      if (FRECUENCIAS.includes(f) && r[f] === undefined) r[f] = i;
    }
    return r;
  };
  // almacén: la columna marcada "ALMACEN" en las filas de arriba, a la izquierda del número
  let alm = -1;
  for (let r = 0; r <= fEnc && alm < 0; r++) alm = tabla[r].findIndex((c, i) => normalizar(c) === "almacen" && i < Math.max(num, den));
  // calendario: las columnas a la derecha de "NÚMERO DE SEMANA"
  let semanas = -1;
  for (let r = 0; r <= fEnc && semanas < 0; r++) semanas = tabla[r].findIndex((c) => /^numero de semana/.test(normalizar(c)));
  return { fEnc, den, num, alm, semanas, plan: frec(gPlan, gLanz), lanz: frec(gLanz, gTiempo), tiempo: frec(gTiempo, gTiempo + 6) };
}

const MESES: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
const p2 = (n: number) => String(n).padStart(2, "0");

/** "04 FEB 26 4M" → { fecha: "2026-02-04", frecuencia: "4M" }; también acepta fechas de Excel. */
function fechaProgramada(c: Celda): { fecha: string; frecuencia: Frecuencia | null } | null {
  if (c instanceof Date) return { fecha: `${c.getUTCFullYear()}-${p2(c.getUTCMonth() + 1)}-${p2(c.getUTCDate())}`, frecuencia: null };
  const m = String(c ?? "").trim().toUpperCase().match(/^(\d{1,2})\s+([A-Z]{3})\.?\s+(\d{2}|\d{4})(?:\s+(\d{1,2}M))?$/);
  if (!m || !MESES[m[2]]) return null;
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const f = (m[4] ?? "") as Frecuencia;
  return { fecha: `${anio}-${p2(MESES[m[2]])}-${p2(Number(m[1]))}`, frecuencia: FRECUENCIAS.includes(f) ? f : null };
}

export function leerPlanAnual(tabla: Celda[][], hoja = ""): Lectura | null {
  const c = columnas(tabla);
  if (!c || c.den < 0) return null;
  const activos: Activo[] = [];
  for (let i = c.fEnc + 1; i < tabla.length; i++) {
    const r = tabla[i];
    const denominacion = String(r[c.den] ?? "").replace(/\s+/g, " ").trim();
    const almacen = c.alm >= 0 ? String(r[c.alm] ?? "").replace(/\s+/g, "").toUpperCase() : "";
    if (!denominacion || !almacen) continue;
    const sap = String(r[c.num] ?? "").trim();
    const planes: Partial<Record<Frecuencia, string>> = {};
    for (const f of FRECUENCIAS) {
      const col = c.plan[f];
      const v = col === undefined ? "" : String(r[col] ?? "").trim();
      if (v) planes[f] = v;
    }
    const suma = (g: Partial<Record<Frecuencia, number>>) => {
      const vals = FRECUENCIAS.map((f) => (g[f] === undefined ? NaN : Number(r[g[f]!]))).filter((n) => Number.isFinite(n));
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const programadas: Activo["programadas"] = [];
    if (c.semanas >= 0) for (let k = c.semanas + 1; k < r.length; k++) { const p = fechaProgramada(r[k]); if (p) programadas.push(p); }
    programadas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    activos.push({
      fila: i + 1, almacen, sap, sinSap: !/^\d{4,}$/.test(sap), denominacion, categoria: categoriaDe(denominacion),
      frecuencias: FRECUENCIAS.filter((f) => planes[f]), planes, lanzamientos: suma(c.lanz), horas: suma(c.tiempo), programadas,
    });
  }
  if (!activos.length) return null;

  // Fichas por almacén: andenes (activos "Andén XXX n"), pasillos ("racks pasillo n"), zonas y techo
  const fichas: FichaArchivo[] = [];
  for (const almacen of [...new Set(activos.map((a) => a.almacen))]) {
    const de = activos.filter((a) => a.almacen === almacen);
    const andenes = de.filter((a) => /^anden [a-z]{2,6} ?\d+/.test(normalizar(a.denominacion))).length;
    const pasillos = new Set(de.flatMap((a) => { const m = normalizar(a.denominacion).match(/\bpasillo (\d+)/); return m ? [Number(m[1])] : []; })).size;
    const zonas = (["taller", "oficina", "bano", "vestidor", "comedor"] as Categoria[]).filter((z) => de.some((a) => a.categoria === z));
    const n = (k: Categoria) => de.filter((a) => a.categoria === k).length;
    fichas.push({ almacen, activos: de.length, andenes, pasillos, zonas, techo: { louvers: n("louver"), extractores: n("extractor"), inyectores: n("inyector") } });
  }
  fichas.sort((a, b) => b.activos - a.activos);

  // Planes propuestos: uno por categoría y frecuencia ("Andén · cuatrimestral")
  const mapa = new Map<string, PlanPropuesto>();
  for (const a of activos) for (const f of a.frecuencias) {
    const k = `${a.categoria}|${f}`;
    const p = mapa.get(k) ?? { nombre: nombrePlan(a.categoria, f), categoria: a.categoria, frecuencia: f, cada_dias: DIAS_FRECUENCIA[f], activos: 0, codigos: [] };
    p.activos++;
    const cod = a.planes[f]!;
    if (!p.codigos.includes(cod)) p.codigos.push(cod);
    mapa.set(k, p);
  }
  const planes = [...mapa.values()].sort((a, b) => b.activos - a.activos);

  // Problemas que conviene limpiar antes de guardar
  const problemas: Lectura["problemas"] = [];
  const sinSap = activos.filter((a) => a.sinSap);
  if (sinSap.length) {
    const por = [...new Set(sinSap.map((a) => a.almacen))].map((x) => `${x}: ${sinSap.filter((a) => a.almacen === x).length}`).join(", ");
    problemas.push({ tipo: "sin-sap", texto: `${sinSap.length} activos con un consecutivo interno en lugar de número SAP (${por}). Se importarían sin SAP.` });
  }
  const cuenta = new Map<string, number>();
  activos.filter((a) => !a.sinSap).forEach((a) => cuenta.set(a.sap, (cuenta.get(a.sap) ?? 0) + 1));
  const rep = [...cuenta].filter(([, n]) => n > 1);
  if (rep.length) problemas.push({ tipo: "sap-repetido", texto: `${rep.length} número${rep.length === 1 ? "" : "s"} SAP repetido${rep.length === 1 ? "" : "s"}: ${rep.slice(0, 8).map(([s, n]) => `${s} (×${n})`).join(", ")}.` });
  const sinFrec = activos.filter((a) => !a.frecuencias.length);
  if (sinFrec.length) problemas.push({ tipo: "sin-frecuencia", texto: `${sinFrec.length} activos sin frecuencia de plan (quedarían sin plan).` });
  const incompletas = fichas.filter((f) => !f.pasillos || !f.andenes);
  if (incompletas.length) problemas.push({
    tipo: "ficha-incompleta",
    texto: `Fichas incompletas: ${incompletas.map((f) => `${f.almacen} (${[!f.andenes && "sin andenes", !f.pasillos && "sin pasillos"].filter(Boolean).join(", ")})`).join("; ")}.`,
  });
  return { hoja, activos, fichas, planes, problemas };
}

// ── Empatar los almacenes del archivo con los de Factory ──────────────────────────────────────────
// Abreviaturas comunes de ciudades y sedes; lo que no empate o tenga varias opciones lo elige la persona.
const ABREVIATURAS: Record<string, string> = { MTY: "MONTERREY", HMO: "HERMOSILLO", HUE: "HUEHUETOCA", VSA: "VILLAHERMOSA", TJN: "TIJUANA", TIJ: "TIJUANA" };
const compacto = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "").toUpperCase();

export function sugerirAlmacen(codigo: string, almacenes: { id: string; nombre: string }[]): { id: string | null; opciones: string[] } {
  const c = compacto(codigo);
  const m = c.match(/^([A-Z]+)(\d*)$/);
  const expandido = m && ABREVIATURAS[m[1]] ? ABREVIATURAS[m[1]] + m[2] : c;
  const exacto = almacenes.filter((a) => compacto(a.nombre) === c || compacto(a.nombre) === expandido);
  if (exacto.length === 1) return { id: exacto[0].id, opciones: [] };
  const parcial = almacenes.filter((a) => { const n = compacto(a.nombre); return n.includes(c) || n.includes(expandido) || (c.length >= 4 && c.includes(n)); });
  if (parcial.length === 1) return { id: parcial[0].id, opciones: [] };
  return { id: null, opciones: parcial.map((a) => a.id) };
}

// ── Carga a Factory ───────────────────────────────────────────────────────────────────────────────

/** Nombre del plan para una categoría y frecuencia ("Andén · cuatrimestral"). */
export function nombrePlan(categoria: Categoria, f: Frecuencia) {
  return `${CATEGORIAS[categoria]} · ${NOMBRE_FRECUENCIA[f]}`;
}

function restarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Fechas del calendario que corresponden a esa frecuencia (si la fecha no la dice y el activo solo tiene una, es esa). */
function fechasDe(a: Activo, f: Frecuencia) {
  return a.programadas.filter((p) => p.frecuencia === f || (p.frecuencia === null && a.frecuencias.length === 1)).map((p) => p.fecha);
}

/** Próxima fecha programada del activo a partir de hoy (cualquier frecuencia). */
export function proximaProgramada(a: Activo, hoy: string) {
  return a.programadas.find((p) => p.fecha >= hoy)?.fecha ?? null;
}

/**
 * Fecha de asignación para que el próximo servicio caiga en la fecha del programa:
 * próximo = asignación + cada. Si ya pasaron todas las fechas del año, se toma la última como hecha.
 */
export function inicioDePlan(a: Activo, f: Frecuencia, hoy: string): string | null {
  const fechas = fechasDe(a, f);
  if (!fechas.length) return null;
  const proxima = fechas.find((x) => x >= hoy);
  return proxima ? restarDias(proxima, DIAS_FRECUENCIA[f]) : fechas[fechas.length - 1];
}

export type Carga = {
  archivo: string;
  activos: { i: number; alm: string; sap: string | null; cons: number | null; nombre: string; cat: Categoria }[];
  planes: { n: string; d: number; t: string }[];
  asignaciones: { i: number; n: string; f: string | null }[];
  fichas: { alm: string; ficha: Record<string, unknown> }[];
};

/** Arma lo que se manda a la base: solo activos de almacenes empatados; un SAP repetido se conserva en su primera aparición. */
export function armarCarga(l: Lectura, empates: Record<string, string>, hoy: string, archivo: string): { carga: Carga; sinAlmacen: number; sapQuitados: number } {
  const vistos = new Set<string>();
  let sinAlmacen = 0, sapQuitados = 0;
  const activos: Carga["activos"] = [];
  const asignaciones: Carga["asignaciones"] = [];
  l.activos.forEach((a, i) => {
    const alm = empates[a.almacen];
    if (!alm) { sinAlmacen++; return; }
    let sap: string | null = a.sinSap ? null : a.sap;
    if (sap && vistos.has(sap)) { sap = null; sapQuitados++; }
    if (sap) vistos.add(sap);
    activos.push({ i, alm, sap, cons: a.sinSap && /^\d+$/.test(a.sap) ? Number(a.sap) : null, nombre: a.denominacion, cat: a.categoria });
    for (const f of a.frecuencias) asignaciones.push({ i, n: nombrePlan(a.categoria, f), f: inicioDePlan(a, f, hoy) });
  });
  const planes = l.planes.map((p) => ({ n: p.nombre, d: p.cada_dias, t: `Códigos de plan SAP: ${p.codigos.join(", ")}` }));
  const fichas = l.fichas.filter((f) => empates[f.almacen]).map((f) => ({
    alm: empates[f.almacen],
    ficha: {
      ...(f.andenes ? { andenes: f.andenes } : {}), ...(f.pasillos ? { pasillos: f.pasillos } : {}),
      zonas: f.zonas, techo: f.techo, fuente: "programa-anual", actualizado: hoy,
    },
  }));
  return { carga: { archivo, activos, planes, asignaciones, fichas }, sinAlmacen, sapQuitados };
}
