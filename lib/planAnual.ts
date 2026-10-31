// Programa anual de mantenimiento: lo que se lee de un Excel (activos, categorías, planes y fichas de almacén)
// antes de guardarlo. Dos lectores llegan a la misma `Lectura`:
//  · el traductor del formato CABLOMTO-F01 (este archivo): una fila por activo con almacén, número SAP,
//    denominación, su plan por frecuencia (1M…12M), lanzamientos, horas y el calendario semanal;
//  · la plantilla Factory (lib/plantillaFactory.ts): una fila por activo y frecuencia, con columnas fijas.
// No guarda nada. Sirve igual para Infraestructura, Críticos, Móviles o cualquier pilar.

export const FRECUENCIAS = ["1M", "2M", "3M", "4M", "6M", "12M"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export const DIAS_FRECUENCIA: Record<Frecuencia, number> = { "1M": 30, "2M": 61, "3M": 91, "4M": 122, "6M": 182, "12M": 365 };
export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  "1M": "mensual", "2M": "bimestral", "3M": "trimestral", "4M": "cuatrimestral", "6M": "semestral", "12M": "anual",
};

export const CATEGORIAS = {
  montacargas: "Montacargas", transpaleta: "Transpaleta", patineta: "Patineta", bateria: "Batería", cargador: "Cargador",
  cambiador: "Cambiador de baterías", diablo: "Diablo de carga", plataforma: "Plataforma o apilador", restregadora: "Restregadora o barredora",
  climatizacion: "Climatización", refrigeracion: "Refrigeración", compresor: "Compresor", osmosis: "Ósmosis", carcamo: "Cárcamo", louver: "Louver", extractor: "Extractor", inyector: "Inyector", racks: "Racks", anden: "Andén", cortina: "Cortina o portón",
  puerta: "Puertas y salidas", taller: "Taller", vestidor: "Vestidores", bano: "Baños", comedor: "Comedor", oficina: "Oficinas",
  area: "Áreas operativas", estructura: "Muros y pisos", balizamiento: "Balizamiento", electrico: "Instalación eléctrica",
  hidraulico: "Instalación hidráulica", exterior: "Exterior y cubierta", jardineria: "Jardinería",
  limpieza: "Limpieza", pintura: "Pintura", servicio: "Servicios generales", otro: "Otro",
} as const;
export type Categoria = keyof typeof CATEGORIAS;

/** Categorías que son un objeto en la nave (se dibujan en 3D); las demás son áreas o actividades. */
export const CON_RENDER = new Set<Categoria>(["montacargas", "transpaleta", "patineta", "bateria", "cargador", "cambiador", "diablo", "plataforma", "restregadora",
  "climatizacion", "refrigeracion", "compresor", "osmosis", "carcamo", "louver", "extractor", "inyector", "racks", "anden", "cortina", "puerta", "electrico"]);

/**
 * Una actividad, no un equipo: "Revisión y reparación andén CDNL 203", "Resane y pintura andén CDNF 03". Es otra fila
 * del plan con su propia clave; no se junta con el equipo que nombra ni se dibuja. Los equipos se nombran
 * EQUIPO ALMACÉN NÚMERO ("Andén SMO 01"). Lo que pertenece a un área ("Mobiliario oficinas 01 CDNF", "Baños
 * oficinas CDNF", "Instalaciones eléctricas andenes") también es servicio.
 */
export const SERVICIO = /^(revi[sc]i?on|reparacion|in[ps]{1,3}e?cc?i?on|resane|pintura|pintra|limpieza|cal[ae]fateo|re?emplazo|analisis|mantenimiento|balizamiento|impermeabilizacion|instalacion(es)?|luminarias?)\b/;
const AREAS = new Set<Categoria>(["taller", "vestidor", "bano", "comedor", "oficina", "area", "estructura", "balizamiento", "exterior", "jardineria", "limpieza", "pintura", "servicio"]);

// El orden importa: primero el tipo de activo y después el tipo de trabajo. Las actividades ("Resane y pintura
// andén…") no toman la categoría del equipo que nombran: van a pintura, limpieza o servicios generales.
// Los equipos móviles van al inicio y anclados al principio del nombre ("Cargador LI…", no "Área de cargadores").
const REGLAS: [Categoria, RegExp][] = [
  ["montacargas", /^montacarga/], ["transpaleta", /^(transpaleta|patin\b)/], ["patineta", /^patineta/],
  ["cambiador", /^(inter)?cambiador de bateria/], ["bateria", /^bateria/], ["cargador", /^cargador\b/], ["diablo", /^diablo/], ["plataforma", /^(plataforma|apilador)/],
  ["restregadora", /^(restregadora|barredora|lavadora de piso)/],
  ["osmosis", /osmosis|cloracion/], ["carcamo", /carcamo/],
  ["climatizacion", /mini ?splits?|cass?ett?e|casette|\buma\b|hvac|condensador|aire acondicionado|chiller|fan ?coil|paquete de aire|unidad paquete|adiabatico/],
  ["refrigeracion", /congela|refrigera|camara fria|mesa fria|cuarto frio|enfriador|antecamara|precamara|multipack/],
  ["compresor", /compresor/],
  ["louver", /louver/], ["extractor", /extractor/], ["inyector", /inyector/], ["racks", /\brack|proteccion/], ["anden", /\banden/],
  ["cortina", /cortina|porton/], ["puerta", /puerta|salida/], ["taller", /taller/], ["vestidor", /vestidor|lock/],
  ["bano", /\bbano|sanitari|mingitorio/], ["comedor", /comedor|cocineta/],
  ["oficina", /oficina|lobby|looby|sala de|archivo|recepcion|\bsite\b|sistemas|mobiliario/],
  ["area", /area tecnica|area de|seguridad patrimonial|modulo|mesa de control|sala friso|segregacion|volteador|dorsal|mezzanine|cargadores|caseta|almacen de/],
  ["estructura", /muro|junta|grieta|losa|loza|\bpiso/],
  ["balizamiento", /baliza|senal/], ["electrico", /electric|lum+inaria|tierras|centro de carga|regulador|planta de emergencia|tabl\w*ro|tra[ns]{1,3}formador|\bups\b|subestacion|pl\w*ta (de )?emergencia|planta electrica|qdlogic|alumbrado|iluminacion|capacitores/],
  ["hidraulico", /agua|pozo|cisterna|hidroneumatico|bomba|tinaco|drenaje|fosa|septica/],
  ["exterior", /exterior|cubierta|techumbre|azotea|impermeab|bajante|canalon|malla|estacionamiento|bacheo|calafateo/],
  ["jardineria", /jardin|areas? verdes?|riego|poda/], ["limpieza", /limpieza|trampa/], ["pintura", /pintura|resane/],
];

/** Sin acentos, minúsculas y espacios simples (tolera "Revicion", "ANDÉN", dobles espacios…). */
export const normalizar = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export const esServicio = (denominacion: string) => SERVICIO.test(normalizar(denominacion)) || AREAS.has(categoriaDe(denominacion));

export function categoriaDe(denominacion: string): Categoria {
  const d = normalizar(denominacion);
  const c = REGLAS.find(([, r]) => r.test(d))?.[0] ?? "otro";
  if (!SERVICIO.test(d)) return c;
  if (/^(resane|pint)/.test(d)) return "pintura";
  if (/^limpieza/.test(d)) return "limpieza";
  return CON_RENDER.has(c) ? "servicio" : c;
}

export type Activo = {
  fila: number;
  almacen: string;        // como viene en el archivo (CDN1, MTY 2, AGRO…)
  sap: string;
  /** Sin número SAP real: vacío, menos de 4 dígitos o parte de la serie 1, 2, 3… del archivo (ver serieConsecutiva). */
  sinSap: boolean;
  /** Clave interna que trae el archivo (plantilla Factory); si no, el consecutivo hace de clave. */
  clave?: string;
  denominacion: string;
  categoria: Categoria;
  frecuencias: Frecuencia[];
  /** Código del plan en SAP por frecuencia (p. ej. 0004). */
  planes: Partial<Record<Frecuencia, string>>;
  /** Nombre del plan por frecuencia cuando el archivo lo trae (columna Servicio); si no, "Categoría · frecuencia". */
  servicio?: Partial<Record<Frecuencia, string>>;
  /** Último servicio hecho por frecuencia (plantilla Factory): de ahí se cuenta el siguiente. */
  ultimo?: Partial<Record<Frecuencia, string>>;
  /** Más servicios con una frecuencia que ya tiene (p. ej. un andén con "Revisión" y "Pintura" cuatrimestrales). */
  extras?: { f: Frecuencia; servicio: string; ultimo?: string; programadas?: string[] }[];
  lanzamientos: number | null;
  /** Horas por servicio ("tiempo por frecuencia"), sumando las frecuencias que tenga. */
  horas: number | null;
  /** Fechas programadas ("04 FEB 26 4M", "06 MAY 26 3M-6M"), en orden; sin frecuencia si la fecha no la dice. */
  programadas: { fecha: string; frecuencias: Frecuencia[] }[];
};

export type FichaArchivo = { almacen: string; activos: number; andenes: number; pasillos: number; zonas: Categoria[]; techo: { louvers: number; extractores: number; inyectores: number } };
export type PlanPropuesto = { nombre: string; categoria: Categoria; frecuencia: Frecuencia; cada_dias: number; activos: number; codigos: string[]; tareas?: string };
export type TipoProblema =
  | "sin-sap" | "sap-repetido" | "sin-frecuencia" | "frecuencia-desconocida" | "fecha-invalida" | "fila-incompleta"
  | "fechas-corregidas" | "fechas-fuera" | "sin-fechas" | "frecuencia-no-cuadra" | "sin-pasillos" | "sin-andenes";
/** Una fila del archivo detrás de un problema, para mostrarla en la lista desplegable del aviso. */
export type FilaProblema = { fila: number; almacen: string; denominacion: string; detalle: string };
/**
 * Lo que conviene revisar antes de guardar. `nivel` dice cómo se pinta: error (paro), aviso (alerta) o info (neutral).
 * Uno por tipo. `filas` trae el detalle; `almacenes`, los almacenes del archivo a los que aplica (sin-pasillos, sin-andenes).
 */
export type Problema = { tipo: TipoProblema; nivel: "error" | "aviso" | "info"; texto: string; filas?: FilaProblema[]; almacenes?: string[] };
export type Lectura = {
  hoja: string;
  /** "cablomto" = programa anual CABLOMTO-F01; "plantilla" = tabla con columnas (plantilla Factory o propia). */
  formato: "cablomto" | "plantilla";
  activos: Activo[];
  fichas: FichaArchivo[];
  planes: PlanPropuesto[];
  problemas: Problema[];
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
  const izquierda = num >= 0 ? num : den;
  let alm = -1;
  for (let r = 0; r <= fEnc && alm < 0; r++) alm = tabla[r].findIndex((c, i) => normalizar(c) === "almacen" && i < izquierda);
  // sin encabezado (versión de Móviles): la columna de la izquierda que trae texto en casi todas las filas
  if (alm < 0) {
    const muestra = tabla.slice(fEnc + 1, fEnc + 81).filter((r) => normalizar(r[den]));
    for (let i = 0; i < izquierda && alm < 0; i++) {
      const conTexto = muestra.filter((r) => /[a-z]/.test(normalizar(r[i]))).length;
      if (muestra.length && conTexto >= muestra.length * 0.8) alm = i;
    }
  }
  // calendario: las columnas a la derecha de "NÚMERO DE SEMANA"
  let semanas = -1, fSem = -1;
  for (let r = 0; r <= fEnc && semanas < 0; r++) { semanas = tabla[r].findIndex((c) => /^numero de semana/.test(normalizar(c))); if (semanas >= 0) fSem = r; }
  return { fEnc, den, num, alm, semanas, fSem, plan: frec(gPlan, gLanz), lanz: frec(gLanz, gTiempo), tiempo: frec(gTiempo, gTiempo + 6) };
}

/** "AÑO: 2026" en las filas de arriba del encabezado (el valor va unas columnas a la derecha). */
function anioEncabezado(tabla: Celda[][], fEnc: number): number | null {
  for (let r = 0; r <= fEnc; r++) {
    const fila = tabla[r] ?? [];
    const i = fila.findIndex((c) => /^ano:?$/.test(normalizar(c)));
    if (i < 0) continue;
    for (let k = i + 1; k < Math.min(fila.length, i + 8); k++) {
      const v = Number(String(fila[k] ?? "").trim());
      if (Number.isInteger(v) && v >= 2000 && v <= 2100) return v;
    }
  }
  return null;
}

const DIA_MS = 86_400_000;
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msDe = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Lunes (inicio) de la semana de cada columna del calendario: la fila de "NÚMERO DE SEMANA" trae 1…53 y la de
 * "PERIODO DE SEMANA" trae "29 al 04". La semana 1 empieza el día que dice su periodo (diciembre del año anterior
 * si es mayor que el día final); sin periodo, el lunes de la semana del 1 de enero. Una columna cuyo periodo no
 * cuadra con su número no se usa.
 */
function semanasDelCalendario(tabla: Celda[][], c: { fEnc: number; semanas: number; fSem: number }, anio: number) {
  const lunes = new Map<number, string>();
  if (c.semanas < 0 || c.fSem < 0) return { lunes, inicio: null as number | null };
  const fNum = tabla[c.fSem];
  let fPer = -1;
  for (let r = 0; r <= c.fEnc && fPer < 0; r++) if ((tabla[r] ?? []).some((x) => /^periodo de semana/.test(normalizar(x)))) fPer = r;
  const periodo = (k: number) => {
    const m = normalizar(fPer >= 0 ? tabla[fPer][k] : "").match(/^(\d{1,2}) ?al ?(\d{1,2})$/);
    return m ? { desde: Number(m[1]), hasta: Number(m[2]) } : null;
  };
  const numero = (k: number) => { const n = Number(String(fNum[k] ?? "").trim()); return Number.isInteger(n) && n >= 1 && n <= 53 ? n : null; };
  const k1 = fNum.findIndex((_, k) => k > c.semanas && numero(k) === 1);
  const p1 = k1 >= 0 ? periodo(k1) : null;
  const enero1 = Date.UTC(anio, 0, 1);
  const inicio = p1
    ? (p1.desde > p1.hasta ? Date.UTC(anio - 1, 11, p1.desde) : Date.UTC(anio, 0, p1.desde))
    : enero1 - ((new Date(enero1).getUTCDay() + 6) % 7) * DIA_MS;
  for (let k = c.semanas + 1; k < fNum.length; k++) {
    const n = numero(k);
    if (n === null) continue;
    const ms = inicio + (n - 1) * 7 * DIA_MS;
    const p = periodo(k);
    if (p && p.desde !== new Date(ms).getUTCDate()) continue;
    lunes.set(k, isoDe(ms));
  }
  return { lunes, inicio };
}

/** La misma fecha con otro año (29 de febrero → 28 si el año no es bisiesto). */
function conAnio(fecha: string, anio: number) {
  const [, m, d] = fecha.split("-").map(Number);
  return `${anio}-${p2(m)}-${p2(Math.min(d, new Date(Date.UTC(anio, m, 0)).getUTCDate()))}`;
}

/** Fechas al año según la frecuencia (1M = 12, 2M = 6…). */
const AL_ANIO: Record<Frecuencia, number> = { "1M": 12, "2M": 6, "3M": 4, "4M": 3, "6M": 2, "12M": 1 };
const fechaTexto = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d} ${["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][Number(m) - 1]} ${y}`;
};

const MESES: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
/** Meses mal escritos que aparecen en los programas ("18 MOV", "EN"). */
const MESES_ERRATAS: Record<string, number> = { MOV: 11, EN: 1, SEPT: 9, AGTO: 8 };
const p2 = (n: number) => String(n).padStart(2, "0");

/** "04 FEB 26 4M" → { fecha: "2026-02-04", frecuencias: ["4M"] }; "06 MAY 26 3M-6M" trae dos; también acepta fechas de Excel. */
export function fechaProgramada(c: Celda): { fecha: string; frecuencias: Frecuencia[] } | null {
  if (c instanceof Date) return { fecha: `${c.getUTCFullYear()}-${p2(c.getUTCMonth() + 1)}-${p2(c.getUTCDate())}`, frecuencias: [] };
  // errores de captura comunes: "0CT" (cero), "25MAY", "OCT26", "264M" (año pegado a la frecuencia)
  const t = String(c ?? "").trim().toUpperCase()
    .replace(/(^|[\s\d])0CT/g, "$1OCT")
    .replace(/(\d)([A-Z]{2,4}\b)/g, "$1 $2")
    .replace(/\b([A-Z]{2,4})(\d)/g, "$1 $2");
  const m = t.match(/^(\d{1,2})\s+([A-Z]{2,4})\.?\s+(\d{4}|\d{2})(?:\s*([\dM\s,/-]+))?$/);
  const mes = m ? MESES[m[2]] ?? MESES_ERRATAS[m[2]] : undefined;
  if (!m || !mes) return null;
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const frecuencias = (m[4] ?? "").split(/[\s,/-]+/).filter((f): f is Frecuencia => FRECUENCIAS.includes(f as Frecuencia));
  // "31 SEP 26" quiere decir fin de mes: el día se ajusta al último del mes
  const dia = Math.min(Number(m[1]), new Date(Date.UTC(anio, mes, 0)).getUTCDate());
  if (dia < 1) return null;
  return { fecha: `${anio}-${p2(mes)}-${p2(dia)}`, frecuencias };
}

/** Semanas de holgura al comparar una fecha con la semana de su columna (0 = tiene que caer en esa semana). */
const HOLGURA_SEMANAS = 0;

export function leerPlanAnual(tabla: Celda[][], hoja = ""): Lectura | null {
  const c = columnas(tabla);
  // el formato se reconoce por el bloque "PLAN DE MANTENIMIENTO" con sus columnas 1M…12M (una tabla plana no lo trae)
  if (!c || c.den < 0 || c.alm < 0 || !Object.keys(c.plan).length) return null;
  type Leida = { col: number; texto: string; fecha: string; frecuencias: Frecuencia[] };
  const leidos: { a: Activo; fechas: Leida[] }[] = [];
  for (let i = c.fEnc + 1; i < tabla.length; i++) {
    const r = tabla[i];
    const denominacion = String(r[c.den] ?? "").replace(/\s+/g, " ").trim();
    const almacen = String(r[c.alm] ?? "").replace(/\s+/g, " ").trim().toUpperCase();
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
    const fechas: Leida[] = [];
    if (c.semanas >= 0) for (let k = c.semanas + 1; k < r.length; k++) {
      const p = fechaProgramada(r[k]);
      if (p) fechas.push({ col: k, texto: r[k] instanceof Date ? fechaTexto(p.fecha) : String(r[k]).replace(/\s+/g, " ").trim(), ...p });
    }
    leidos.push({
      a: {
        fila: i + 1, almacen, sap, sinSap: !/^\d{4,}$/.test(sap), denominacion, categoria: categoriaDe(denominacion),
        frecuencias: FRECUENCIAS.filter((f) => planes[f]), planes, lanzamientos: suma(c.lanz), horas: suma(c.tiempo), programadas: [],
      },
      fechas,
    });
  }
  if (!leidos.length) return null;

  // Año del programa: el del encabezado ("AÑO: 2026") o el que más se repite en las fechas
  const porAnio = new Map<number, number>();
  for (const { fechas } of leidos) for (const f of fechas) { const y = Number(f.fecha.slice(0, 4)); porAnio.set(y, (porAnio.get(y) ?? 0) + 1); }
  const anio = anioEncabezado(tabla, c.fEnc) ?? [...porAnio].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const { lunes, inicio } = anio ? semanasDelCalendario(tabla, c, anio) : { lunes: new Map<number, string>(), inicio: null };
  const semanaDe = (ms: number) => (inicio === null ? null : Math.floor((ms - inicio) / (7 * DIA_MS)) + 1);
  const enSuSemana = (fecha: string, col: number) => {
    const l = lunes.get(col);
    if (!l) return false;
    const d = msDe(fecha) - msDe(l);
    return d >= -HOLGURA_SEMANAS * 7 * DIA_MS && d < (1 + HOLGURA_SEMANAS) * 7 * DIA_MS;
  };

  // Una fecha de otro año cuya columna es de una semana del programa tiene el año mal capturado ("15 JUL 25" en la
  // semana 29 de 2026): se corrige. Si no se puede saber, no se carga y queda como problema.
  const corregidas: FilaProblema[] = [], fuera: FilaProblema[] = [];
  for (const { a, fechas } of leidos) {
    const fila = (detalle: string): FilaProblema => ({ fila: a.fila, almacen: a.almacen, denominacion: a.denominacion, detalle });
    for (const f of fechas) {
      let fecha = f.fecha;
      if (anio && Number(fecha.slice(0, 4)) !== anio && !enSuSemana(fecha, f.col)) {
        const nueva = conAnio(fecha, anio);
        const l = lunes.get(f.col), sem = l ? ` (semana ${semanaDe(msDe(l))})` : "";
        if (enSuSemana(nueva, f.col)) { corregidas.push(fila(`«${f.texto}» → ${fechaTexto(nueva)}${sem}`)); fecha = nueva; }
        else { fuera.push(fila(`«${f.texto}»${l ? ` en la columna de la semana ${semanaDe(msDe(l))}` : ""}`)); continue; }
      }
      a.programadas.push({ fecha, frecuencias: f.frecuencias });
    }
    a.programadas.sort((x, y) => x.fecha.localeCompare(y.fecha));
  }
  const activos = leidos.map((x) => x.a);
  const extra: Problema[] = [];
  const s = (n: number, uno = "", varios = "s") => (n === 1 ? uno : varios);
  if (corregidas.length) extra.push({
    tipo: "fechas-corregidas", nivel: "info", filas: corregidas,
    texto: `${corregidas.length} fecha${s(corregidas.length)} con año mal capturado corregida${s(corregidas.length)} a ${anio}: su columna es de una semana de ${anio}.`,
  });
  if (fuera.length) extra.push({
    tipo: "fechas-fuera", nivel: "error", filas: fuera,
    texto: `${fuera.length} fecha${s(fuera.length)} fuera de ${anio} que no se pud${s(fuera.length, "o", "ieron")} corregir: no entra${s(fuera.length, "", "n")} al programa. Corrígela${s(fuera.length)} en el archivo.`,
  });

  // Fechas contra el plan: solo si el archivo trae calendario
  if (c.semanas >= 0) {
    const sinFechas: FilaProblema[] = [], noCuadra: FilaProblema[] = [];
    // Fechas esperadas en las semanas que cubre el calendario: el año completo pide las exactas (trimestral = 4);
    // uno de 48 semanas (Móviles, Críticos) admite una menos según el mes en que arranque.
    const cubiertas = Math.min(52, inicio === null || !lunes.size ? 52 : Math.max(...[...lunes.values()].map((l) => semanaDe(msDe(l)) ?? 0)));
    const esperadas = (f: Frecuencia): [number, number] => {
      if (cubiertas >= 52) return [AL_ANIO[f], AL_ANIO[f]];
      const x = (AL_ANIO[f] * cubiertas) / 52;
      return [Math.max(1, Math.floor(x)), Math.ceil(x)];
    };
    for (const a of activos) {
      const fila = (detalle: string): FilaProblema => ({ fila: a.fila, almacen: a.almacen, denominacion: a.denominacion, detalle });
      const otras = [...new Set(a.programadas.flatMap((p) => p.frecuencias))].filter((f) => !a.frecuencias.includes(f));
      for (const f of a.frecuencias) {
        const fechas = [...new Set(fechasDe(a, f))];
        if (!fechas.length) {
          sinFechas.push(fila(otras.length
            ? `Plan ${f}; sus fechas dicen ${otras.join(", ")} (${a.programadas.slice(0, 3).map((p) => fechaTexto(p.fecha)).join(", ")})`
            : `Plan ${f} sin fechas en el calendario (vacío o con error, p. ej. #REF!)`));
          continue;
        }
        // La visita de una frecuencia mayor cubre a la menor: trimestral + anual = 3 fechas 3M y 1 de 12M, o 4 de 3M
        // con la anual el mismo día ("3M-12M"); las dos formas suman 4 visitas.
        const mayores = a.frecuencias.filter((g) => DIAS_FRECUENCIA[g] > DIAS_FRECUENCIA[f]);
        const cubren = new Set([...fechas, ...mayores.flatMap((g) => fechasDe(a, g))]);
        const delAnio = [...cubren].filter((x) => Number(x.slice(0, 4)) === anio);
        const [min, max] = esperadas(f);
        if (anio && (delAnio.length < min || delAnio.length > max)) {
          noCuadra.push(fila(`${f}: ${delAnio.length} fecha${s(delAnio.length)} en ${anio} en vez de ${min === max ? min : `${min} o ${max}`}`));
        }
        const porSemana = new Map<number, string[]>();
        for (const x of fechas) { const w = semanaDe(msDe(x)); if (w !== null) porSemana.set(w, [...(porSemana.get(w) ?? []), x]); }
        for (const [w, xs] of porSemana) if (xs.length > 1) noCuadra.push(fila(`${xs.length} fechas ${f} en la semana ${w} (${xs.map(fechaTexto).join(" y ")})`));
      }
    }
    if (sinFechas.length) extra.push({
      tipo: "sin-fechas", nivel: "aviso", filas: sinFechas,
      texto: `${sinFechas.length} plan${s(sinFechas.length, "", "es")} sin fechas en el calendario, o con fechas de otra frecuencia: no entra${s(sinFechas.length, "", "n")} al programa semanal y se cuenta${s(sinFechas.length, "", "n")} desde hoy.`,
    });
    if (noCuadra.length) extra.push({
      tipo: "frecuencia-no-cuadra", nivel: "aviso", filas: noCuadra,
      texto: `${noCuadra.length} caso${s(noCuadra.length)} en que las fechas no cuadran con la frecuencia (p. ej. trimestral con 3 fechas en el año, o dos fechas en la misma semana). Se cargan como vienen.`,
    });
  }
  return armarLectura("cablomto", hoja, activos, extra);
}

/** Fichas, planes propuestos y problemas a partir de los activos leídos (común a los dos lectores). */
export function armarLectura(formato: Lectura["formato"], hoja: string, activos: Activo[], extra: Problema[] = [], tareas: Record<string, string> = {}): Lectura {
  // Un número de 4 dígitos o más que sigue la serie 1, 2, 3… del archivo es consecutivo, no SAP
  const tope = serieConsecutiva(activos.filter((a) => !a.clave).map((a) => a.sap));
  for (const a of activos) if (!a.sinSap && /^\d+$/.test(a.sap) && Number(a.sap) <= tope) a.sinSap = true;

  // Fichas por almacén: andenes (activos "Andén XXX n"), pasillos ("racks pasillo n"), zonas y techo
  const fichas: FichaArchivo[] = [];
  for (const almacen of [...new Set(activos.map((a) => a.almacen))]) {
    const de = activos.filter((a) => a.almacen === almacen);
    const andenes = de.filter((a) => ANDEN.test(normalizar(a.denominacion))).length;
    const pasillos = new Set(de.flatMap((a) => { const m = normalizar(a.denominacion).match(/\bpasillo (\d+)/); return m ? [Number(m[1])] : []; })).size;
    const zonas = (["taller", "oficina", "bano", "vestidor", "comedor"] as Categoria[]).filter((z) => de.some((a) => a.categoria === z));
    const n = (k: Categoria) => de.filter((a) => a.categoria === k).length;
    fichas.push({ almacen, activos: de.length, andenes, pasillos, zonas, techo: { louvers: n("louver"), extractores: n("extractor"), inyectores: n("inyector") } });
  }
  fichas.sort((a, b) => b.activos - a.activos);

  // Planes propuestos: uno por categoría y frecuencia ("Andén · cuatrimestral"), o el servicio que diga el archivo
  const mapa = new Map<string, PlanPropuesto>();
  for (const a of activos) for (const { f, nombre } of serviciosDe(a)) {
    const k = normalizar(nombre);
    const p = mapa.get(k) ?? { nombre, categoria: a.categoria, frecuencia: f, cada_dias: DIAS_FRECUENCIA[f], activos: 0, codigos: [], ...(tareas[k] ? { tareas: tareas[k] } : {}) };
    p.activos++;
    const cod = a.planes[f];
    if (cod && !p.codigos.includes(cod)) p.codigos.push(cod);
    mapa.set(k, p);
  }
  const planes = [...mapa.values()].sort((a, b) => b.activos - a.activos);

  // Problemas que conviene limpiar antes de guardar
  const problemas: Problema[] = [];
  const sinSap = activos.filter((a) => a.sinSap && !esServicio(a.denominacion));
  if (sinSap.length) {
    const por = [...new Set(sinSap.map((a) => a.almacen))].map((x) => `${x}: ${sinSap.filter((a) => a.almacen === x).length}`).join(", ");
    problemas.push({ tipo: "sin-sap", nivel: "aviso", texto: `${sinSap.length} equipo${sinSap.length === 1 ? "" : "s"} sin número SAP, por dar de alta (${por}). Se cargan con su consecutivo como clave interna y quedan marcados en Equipos hasta que se capture su SAP.` });
  }
  const cuenta = new Map<string, number>();
  activos.filter((a) => !a.sinSap).forEach((a) => cuenta.set(a.sap, (cuenta.get(a.sap) ?? 0) + 1));
  const rep = [...cuenta].filter(([, n]) => n > 1);
  if (rep.length) problemas.push({ tipo: "sap-repetido", nivel: "error", texto: `${rep.length} número${rep.length === 1 ? "" : "s"} SAP repetido${rep.length === 1 ? "" : "s"}: ${rep.slice(0, 8).map(([s, n]) => `${s} (×${n})`).join(", ")}.` });
  const sinFrec = activos.filter((a) => !a.frecuencias.length);
  if (sinFrec.length) problemas.push({
    tipo: "sin-frecuencia", nivel: "error", texto: `${sinFrec.length} activo${sinFrec.length === 1 ? "" : "s"} sin frecuencia de plan (quedaría${sinFrec.length === 1 ? "" : "n"} sin plan).`,
    filas: sinFrec.map((a) => ({ fila: a.fila, almacen: a.almacen, denominacion: a.denominacion, detalle: "Sin frecuencia en el plan de mantenimiento" })),
  });
  problemas.push(...extra);
  // Solo si el archivo describe naves (trae andenes o pasillos); el de Críticos, por ejemplo, no. No es un error de
  // lectura: el programa no trae mantenimiento de racks por pasillo (o de andenes) en esos almacenes.
  const describeNaves = fichas.some((f) => f.andenes || f.pasillos);
  const faltan = (k: "pasillos" | "andenes") => (describeNaves ? fichas.filter((f) => !f[k]).map((f) => f.almacen) : []);
  const sinPasillos = faltan("pasillos"), sinAndenes = faltan("andenes");
  if (sinPasillos.length) problemas.push({
    tipo: "sin-pasillos", nivel: "aviso", almacenes: sinPasillos,
    texto: `Sin mantenimiento de racks por pasillo en: ${sinPasillos.join(", ")} — la nave se dibuja sin pasillos; puedes capturar los pasillos aquí o en Configuración.`,
  });
  if (sinAndenes.length) problemas.push({
    tipo: "sin-andenes", nivel: "aviso", almacenes: sinAndenes,
    texto: `Sin mantenimiento de andenes en: ${sinAndenes.join(", ")} — la nave se dibuja sin andenes; puedes capturar los andenes aquí o en Configuración.`,
  });
  return { hoja, formato, activos, fichas, planes, problemas };
}

// ── Empatar los almacenes del archivo con los de Factory ──────────────────────────────────────────
// Abreviaturas comunes de ciudades y sedes; lo que no empate o tenga varias opciones lo elige la persona.
const ABREVIATURAS: Record<string, string> = { MTY: "MONTERREY", MYT: "MONTERREY", HMO: "HERMOSILLO", HUE: "HUEHUETOCA", VSA: "VILLAHERMOSA", TJN: "TIJUANA", TIJ: "TIJUANA" };
const compacto = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, "").toUpperCase();

export function sugerirAlmacen(codigo: string, almacenes: { id: string; nombre: string }[]): { id: string | null; opciones: string[] } {
  const c = compacto(codigo);
  const m = c.match(/^([A-Z]+)(\d*)$/);
  const expandido = m && ABREVIATURAS[m[1]] ? ABREVIATURAS[m[1]] + m[2] : c;
  const exacto = almacenes.filter((a) => compacto(a.nombre) === c || compacto(a.nombre) === expandido);
  if (exacto.length === 1) return { id: exacto[0].id, opciones: [] };
  const parcial = almacenes.filter((a) => { const n = compacto(a.nombre); return n.includes(c) || n.includes(expandido) || (c.length >= 4 && c.includes(n)); });
  if (parcial.length === 1) return { id: parcial[0].id, opciones: [] };
  if (parcial.length) return { id: null, opciones: parcial.map((a) => a.id) };
  // por palabra: "CULIACAN MARI" → "CDE Culiacan"; "AMSA STA ROSA" → las dos de AMSA como opciones
  const palabras = (t: string) => normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w));
  const mias = palabras(codigo);
  const porPalabra = almacenes.filter((a) => palabras(a.nombre).some((w) => mias.includes(w)));
  return porPalabra.length === 1 ? { id: porPalabra[0].id, opciones: [] } : { id: null, opciones: porPalabra.map((a) => a.id) };
}

// ── Carga a Factory ───────────────────────────────────────────────────────────────────────────────

/** Nombre del plan para una categoría y frecuencia ("Andén · cuatrimestral"). */
export function nombrePlan(categoria: Categoria, f: Frecuencia) {
  return `${CATEGORIAS[categoria]} · ${NOMBRE_FRECUENCIA[f]}`;
}

/** Andén con su clave y número, también con número romano en medio ("Anden MTY II 01"). */
export const ANDEN = /^anden [a-z]{2,6} ?(?:[ivx]+ )?\d+/;

/**
 * Hasta dónde llega la serie 1, 2, 3… con que el archivo numera lo que no tiene SAP: el número más alto tal que
 * al menos el 90 % de 1…n aparece. En CAB Inmueble la serie va de 1 a 2127 y los SAP reales son de 5 dígitos;
 * en Móviles cada almacén numera desde 1 y los SAP de 4 dígitos (3816…) quedan fuera de la serie.
 */
export function serieConsecutiva(numeros: string[]) {
  const n = [...new Set(numeros.filter((s) => /^\d+$/.test(s)).map(Number))].filter((x) => x > 0).sort((a, b) => a - b);
  let tope = 0;
  n.forEach((v, i) => { if ((i + 1) / v >= 0.9) tope = v; });
  return tope;
}

/** Todos los servicios del activo: uno por frecuencia más los extra con la misma frecuencia. */
export function serviciosDe(a: Activo): { f: Frecuencia; nombre: string; extra: boolean; ultimo?: string; programadas?: string[] }[] {
  return [
    ...a.frecuencias.map((f) => ({ f, nombre: planDe(a, f), extra: false })),
    ...(a.extras ?? []).map((e) => ({ f: e.f, nombre: e.servicio, extra: true, ultimo: e.ultimo, programadas: e.programadas })),
  ];
}

/** Plan del activo en esa frecuencia: el servicio que diga el archivo o "Categoría · frecuencia". */
export function planDe(a: Activo, f: Frecuencia) {
  return a.servicio?.[f] ?? nombrePlan(a.categoria, f);
}

export function restarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Fechas del calendario que corresponden a esa frecuencia (si la fecha no la dice y el activo solo tiene una, es esa). */
function fechasDe(a: Activo, f: Frecuencia) {
  return a.programadas.filter((p) => p.frecuencias.includes(f) || (!p.frecuencias.length && a.frecuencias.length === 1)).map((p) => p.fecha);
}

/** Próxima fecha programada del activo a partir de hoy (cualquier frecuencia). */
export function proximaProgramada(a: Activo, hoy: string) {
  return a.programadas.find((p) => p.fecha >= hoy)?.fecha ?? null;
}

/**
 * Fecha de asignación para que el próximo servicio caiga en la fecha del programa:
 * próximo = asignación + cada. Si el archivo dice el último servicio, se cuenta desde ahí.
 * Del calendario anual: si ya pasaron todas las fechas del año, se toma la última como hecha.
 */
export function inicioDePlan(a: Activo, f: Frecuencia, hoy: string): string | null {
  if (a.ultimo?.[f]) return a.ultimo[f]!;
  const fechas = fechasDe(a, f);
  if (!fechas.length) return null;
  const proxima = fechas.find((x) => x >= hoy);
  return proxima ? restarDias(proxima, DIAS_FRECUENCIA[f]) : fechas[fechas.length - 1];
}

/** Valor del selector de almacén para no cargar ese almacén (sitios que no existen en Factory). */
export const OMITIR = "__omitir";

export type Carga = {
  archivo: string;
  activos: { i: number; alm: string; sap: string | null; cons: number | null; clave: string | null; nombre: string; cat: Categoria }[];
  planes: { n: string; d: number; t: string }[];
  asignaciones: { i: number; n: string; f: string | null }[];
  /** Fechas programadas del calendario: i = activo, n = plan, f = fecha (AAAA-MM-DD). Van a programa_mantenimiento. */
  programa: { i: number; n: string; f: string }[];
  fichas: { alm: string; ficha: Record<string, unknown> }[];
};

/**
 * Arma lo que se manda a la base: solo activos de almacenes empatados; un SAP o una clave repetidos se conservan en
 * su primera aparición. El consecutivo de los activos sin SAP es su clave (INF-784) solo si no se repite en el
 * archivo: en Móviles cada almacén numera desde 1, y ahí esos activos se reconocen por almacén y nombre.
 */
/** Andenes y pasillos que la persona captura en la revisión, por almacén del archivo; mandan sobre lo leído. */
export type AjustesFicha = Record<string, { andenes?: number; pasillos?: number }>;

export function armarCarga(
  l: Lectura, empates: Record<string, string>, hoy: string, archivo: string, pilar = "", ajustesFicha: AjustesFicha = {},
): { carga: Carga; sinAlmacen: number; sapQuitados: number; clavesQuitadas: number; ajustesIgnorados: string[] } {
  const vistos = new Set<string>(), claves = new Set<string>();
  const consecutivos = l.activos.filter((a) => a.sinSap && /^\d+$/.test(a.sap)).map((a) => Number(a.sap));
  const consUnico = new Set(consecutivos).size === consecutivos.length;
  let sinAlmacen = 0, sapQuitados = 0, clavesQuitadas = 0;
  const activos: Carga["activos"] = [];
  const asignaciones: Carga["asignaciones"] = [];
  const programa: Carga["programa"] = [];
  l.activos.forEach((a, i) => {
    const alm = empates[a.almacen];
    if (!alm || alm === OMITIR) { sinAlmacen++; return; }
    let sap: string | null = a.sinSap ? null : a.sap;
    if (sap && vistos.has(sap)) { sap = null; sapQuitados++; }
    if (sap) vistos.add(sap);
    let clave = a.clave || null;
    if (clave && claves.has(clave)) { clave = null; clavesQuitadas++; }
    if (clave) claves.add(clave);
    const cons = consUnico && a.sinSap && /^\d+$/.test(a.sap) ? Number(a.sap) : null;
    // Un servicio no se da de alta en SAP: su clave hace de número (INF-11) y no queda como pendiente
    if (!sap && esServicio(a.denominacion)) {
      const propia = clave ?? (cons !== null && pilar ? `${pilar.slice(0, 3).toUpperCase()}-${cons}` : null);
      if (propia && !vistos.has(propia)) { sap = propia; vistos.add(propia); }
    }
    activos.push({ i, alm, sap, cons, clave, nombre: a.denominacion, cat: a.categoria });
    for (const s of serviciosDe(a)) {
      asignaciones.push({ i, n: s.nombre, f: s.extra ? s.ultimo ?? null : inicioDePlan(a, s.f, hoy) });
      // un servicio extra usa sus propias fechas; si no trae, las del calendario de esa frecuencia
      const fechas = s.extra && s.programadas?.length ? s.programadas : fechasDe(a, s.f);
      for (const f of new Set(fechas)) programa.push({ i, n: s.nombre, f });
    }
  });
  // solo los planes que usa algún activo que sí se carga
  const usados = new Set(asignaciones.map((x) => normalizar(x.n)));
  const planes = l.planes.filter((p) => usados.has(normalizar(p.nombre))).map((p) => ({
    n: p.nombre, d: p.cada_dias, t: p.tareas ?? (p.codigos.length ? `Códigos de plan SAP: ${p.codigos.join(", ")}` : ""),
  }));
  // La ficha solo se actualiza desde archivos que describen la nave (andenes o pasillos), o si la persona la
  // ajustó en la revisión: así un programa de otro pilar no borra lo que dejó el de Infraestructura.
  const ajustesIgnorados: string[] = [];
  const ajuste = (almacen: string) => {
    const a = ajustesFicha[almacen];
    if (!a) return {};
    const r: { andenes?: number; pasillos?: number } = {};
    for (const k of ["andenes", "pasillos"] as const) {
      if (a[k] === undefined) continue;
      if (enteroFicha(a[k])) r[k] = a[k]; else ajustesIgnorados.push(`${almacen}: ${k}`);
    }
    return r;
  };
  const fichas = l.fichas.flatMap((f) => {
    const alm = empates[f.almacen];
    if (!alm || alm === OMITIR) return [];
    const aj = ajuste(f.almacen);
    const andenes = aj.andenes ?? f.andenes, pasillos = aj.pasillos ?? f.pasillos;
    if (!f.andenes && !f.pasillos && aj.andenes === undefined && aj.pasillos === undefined) return [];
    return [{
      alm,
      ficha: {
        ...(andenes || aj.andenes !== undefined ? { andenes } : {}), ...(pasillos || aj.pasillos !== undefined ? { pasillos } : {}),
        ...(f.zonas.length ? { zonas: f.zonas } : {}),
        ...(f.techo.louvers + f.techo.extractores + f.techo.inyectores ? { techo: f.techo } : {}),
        fuente: "programa-anual", actualizado: hoy,
      },
    }];
  });
  return { carga: { archivo, activos, planes, asignaciones, programa, fichas }, sinAlmacen, sapQuitados, clavesQuitadas, ajustesIgnorados };
}

/** Andenes o pasillos válidos en una ficha: entero de 0 a 500. */
export const enteroFicha = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 500;

export type ResumenFechas = {
  total: number;
  /** Fechas por mes ("2026-03" → 512), en orden. */
  porMes: Record<string, number>;
  /** Fechas en la semana 1 del año (lunes a domingo de la semana del 1 de enero). */
  semana1: number;
  porAlmacen: Record<string, number>;
  desde: string | null;
  hasta: string | null;
};

/**
 * Resumen de las fechas que lleva la carga, para mostrarlo antes de simular. Cuenta cada fecha distinta de cada
 * activo y plan (lo mismo que se guarda); `porAlmacen` va por id del almacén de Factory.
 */
export function resumenFechas(carga: Carga): ResumenFechas {
  const alm = new Map(carga.activos.map((a) => [a.i, a.alm]));
  const vistas = new Set<string>();
  const porMes: Record<string, number> = {}, porAlmacen: Record<string, number> = {};
  let desde: string | null = null, hasta: string | null = null;
  for (const p of carga.programa) {
    const k = `${p.i}|${normalizar(p.n)}|${p.f}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    const mes = p.f.slice(0, 7);
    porMes[mes] = (porMes[mes] ?? 0) + 1;
    const a = alm.get(p.i) ?? "";
    porAlmacen[a] = (porAlmacen[a] ?? 0) + 1;
    if (!desde || p.f < desde) desde = p.f;
    if (!hasta || p.f > hasta) hasta = p.f;
  }
  // semana 1: la que contiene el 1 de enero del año que más se repite
  const porAnio = new Map<string, number>();
  for (const [mes, n] of Object.entries(porMes)) porAnio.set(mes.slice(0, 4), (porAnio.get(mes.slice(0, 4)) ?? 0) + n);
  const anio = Number([...porAnio].sort((x, y) => y[1] - x[1])[0]?.[0]);
  let semana1 = 0;
  if (anio) {
    const enero1 = Date.UTC(anio, 0, 1);
    const lunes = enero1 - ((new Date(enero1).getUTCDay() + 6) % 7) * DIA_MS;
    const ini = isoDe(lunes), fin = isoDe(lunes + 6 * DIA_MS);
    for (const k of vistas) { const f = k.slice(k.lastIndexOf("|") + 1); if (f >= ini && f <= fin) semana1++; }
  }
  const ordenado = Object.fromEntries(Object.entries(porMes).sort(([x], [y]) => x.localeCompare(y)));
  return { total: vistas.size, porMes: ordenado, semana1, porAlmacen, desde, hasta };
}
