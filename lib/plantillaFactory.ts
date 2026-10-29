// Plantilla Factory del programa de mantenimiento: una tabla plana, una fila por activo y frecuencia.
// Es el formato estándar para cualquier empresa. Si su Excel trae otros nombres de columna, en la revisión
// se unen a estos campos una vez y el mapeo queda guardado para la empresa (tenants.mapeos_importacion).
import { leerFecha } from "./historial";
import {
  armarLectura, CATEGORIAS, categoriaDe, DIAS_FRECUENCIA, fechaProgramada, FRECUENCIAS, NOMBRE_FRECUENCIA, nombrePlan, normalizar, restarDias,
  type Activo, type Categoria, type Frecuencia, type Lectura, type Problema,
} from "./planAnual";
import { libroXlsx } from "./xlsx";

export const CAMPOS = [
  { clave: "almacen", etiqueta: "Almacén", requerido: true, alias: ["almacen", "cedis", "sitio", "ubicacion", "sucursal", "planta", "centro"], ayuda: "Nombre o código del almacén. En la revisión se empata con los de Factory." },
  { clave: "sap", etiqueta: "SAP", alias: ["sap", "numero sap", "no sap", "num sap", "equipo sap", "n", "no", "numero"], ayuda: "Número SAP del activo. Si no tiene, déjalo vacío o pon su consecutivo." },
  { clave: "clave", etiqueta: "Clave", alias: ["clave", "clave interna", "consecutivo", "codigo", "id"], ayuda: "Tu código interno (p. ej. MC-04), si lo usan." },
  { clave: "denominacion", etiqueta: "Denominación", requerido: true, alias: ["denominacion", "denominacion del equipo", "equipo", "activo", "nombre", "nombre del equipo", "descripcion"], ayuda: "Nombre del activo como lo conocen en el almacén." },
  { clave: "categoria", etiqueta: "Categoría", alias: ["categoria", "tipo", "tipo de equipo", "tipo de activo", "familia"], ayuda: "Si va vacía, Factory la deduce de la denominación." },
  { clave: "frecuencia", etiqueta: "Frecuencia", requerido: true, alias: ["frecuencia", "frecuencia del mantenimiento", "frecuencia de mantenimiento", "periodicidad", "cada", "cada dias"], ayuda: "1M, 2M, 3M, 4M, 6M o 12M (también «mensual», «bimestral»…). Una fila por frecuencia." },
  { clave: "proxima", etiqueta: "Próxima fecha", alias: ["proxima", "proxima fecha", "fecha programada", "fecha inicio", "fecha de inicio", "programado", "fecha"], ayuda: "Cuándo toca el próximo servicio (dd/mm/aaaa)." },
  { clave: "ultimo", etiqueta: "Último servicio", alias: ["ultimo", "ultimo servicio", "fecha ultimo servicio", "ultima fecha"], ayuda: "En lugar de la próxima fecha: cuándo se hizo el último." },
  { clave: "servicio", etiqueta: "Servicio", alias: ["servicio", "nombre del plan", "plan", "nombre plan"], ayuda: "Nombre del plan. Si va vacío: «Categoría · frecuencia» (p. ej. «Montacargas · bimestral»)." },
  { clave: "planSap", etiqueta: "Plan SAP", alias: ["plan sap", "codigo de plan", "codigo plan", "plan de mantenimiento"], ayuda: "Código del plan en SAP, como referencia." },
  { clave: "tareas", etiqueta: "Tareas", alias: ["tareas", "actividades", "checklist"], ayuda: "Tareas del plan separadas por punto y coma." },
] as const;
export type Campo = (typeof CAMPOS)[number]["clave"];
/** Campo → índice de la columna del archivo. */
export type Mapeo = Partial<Record<Campo, number>>;
/**
 * Lo que se guarda por empresa: firma de los encabezados → campo → encabezado (normalizado), y en
 * ALMACENES_ELEGIDOS, almacén del archivo (normalizado) → id del almacén de Factory u OMITIR.
 */
export type MapeosGuardados = Record<string, Record<string, string>>;
export const ALMACENES_ELEGIDOS = "__almacenes";

const enc = (v: unknown) => normalizar(v).replace(/[^a-z0-9 ]/g, "").trim();
const coincide = (h: string, c: (typeof CAMPOS)[number]) => !!h && ((c.alias as readonly string[]).includes(h) || h === enc(c.etiqueta));

/** Fila de encabezados: de las primeras 15, la que más campos reconoce (al menos 2). */
export function filaEncabezados(tabla: string[][]) {
  let mejor = -1, max = 1;
  tabla.slice(0, 15).forEach((r, i) => {
    const n = CAMPOS.filter((c) => r.some((h) => coincide(enc(h), c))).length;
    if (n > max) { max = n; mejor = i; }
  });
  return mejor;
}

/** Identifica un formato de columnas (mismo archivo cada mes → misma firma → mismo mapeo). */
export const firmaEncabezados = (encabezados: string[]) => encabezados.map(enc).filter(Boolean).join("|");

export function mapeoAutomatico(encabezados: string[], guardado?: Partial<Record<Campo, string>>): Mapeo {
  const hs = encabezados.map(enc);
  const usados = new Set<number>();
  const m: Mapeo = {};
  for (const c of CAMPOS) {
    const i = guardado ? (guardado[c.clave] ? hs.indexOf(guardado[c.clave]!) : -1) : hs.findIndex((h, j) => !usados.has(j) && coincide(h, c));
    if (i >= 0) { m[c.clave] = i; usados.add(i); }
  }
  return m;
}

export const mapeoParaGuardar = (encabezados: string[], m: Mapeo) =>
  Object.fromEntries(Object.entries(m).filter(([, i]) => i !== undefined).map(([k, i]) => [k, enc(encabezados[i!])])) as Partial<Record<Campo, string>>;

export const faltantes = (m: Mapeo) => CAMPOS.filter((c) => "requerido" in c && c.requerido && m[c.clave] === undefined);

const PALABRAS: Record<string, Frecuencia> = { mensual: "1M", bimestral: "2M", trimestral: "3M", cuatrimestral: "4M", semestral: "6M", anual: "12M" };

/** "2M", "2 meses", "Bimestral", "60 días", "3M-6M" → frecuencias; lo que no se reconozca queda fuera. */
export function frecuenciasDe(v: string): Frecuencia[] {
  const fs = new Set<Frecuencia>();
  for (const t of normalizar(v).split(/[,;/+-]|\sy\s/).map((x) => x.trim()).filter(Boolean)) {
    const meses = t.match(/^(\d{1,2})\s*m(es|eses)?$/);
    const dias = t.match(/^(\d{1,3})\s*(d|dia|dias)?$/);
    const f = meses ? (`${Number(meses[1])}M` as Frecuencia)
      : PALABRAS[t] ?? (dias ? FRECUENCIAS.find((x) => Math.abs(DIAS_FRECUENCIA[x] - Number(dias[1])) <= 5) : undefined);
    if (f && FRECUENCIAS.includes(f)) fs.add(f);
  }
  return FRECUENCIAS.filter((f) => fs.has(f));
}

const categoriaTexto = (v: string): Categoria | null => {
  const t = normalizar(v);
  if (!t) return null;
  return (Object.keys(CATEGORIAS) as Categoria[]).find((k) => k === t || normalizar(CATEGORIAS[k]) === t) ?? null;
};

/** dd/mm/aaaa, aaaa-mm-dd o "04 FEB 26" → "aaaa-mm-dd"; vacío → null; no se entiende → undefined. */
function dia(v: string): string | null | undefined {
  if (!v) return null;
  return fechaProgramada(v)?.fecha ?? leerFecha(v, "dmy")?.slice(0, 10) ?? undefined;
}

export function leerPlantilla(tabla: string[][], filaEnc: number, m: Mapeo, hoja: string): Lectura | null {
  if (filaEnc < 0 || faltantes(m).length) return null;
  const v = (r: string[], k: Campo) => (m[k] === undefined ? "" : String(r[m[k]!] ?? "").replace(/\s+/g, " ").trim());
  const activos = new Map<string, Activo>();
  const tareas: Record<string, string> = {};
  const desconocidas = new Map<string, number>();
  let fechasMalas = 0, incompletas = 0;

  for (let i = filaEnc + 1; i < tabla.length; i++) {
    const r = tabla[i];
    const almacen = v(r, "almacen").toUpperCase(), den = v(r, "denominacion");
    if (!almacen && !den) continue;
    if (!almacen || !den) { incompletas++; continue; }
    const sap = v(r, "sap"), clave = v(r, "clave");
    const k = `${normalizar(almacen)}|${sap || clave || normalizar(den)}`;
    let a = activos.get(k);
    if (!a) {
      a = {
        fila: i + 1, almacen, sap, sinSap: !/^\d{4,}$/.test(sap), ...(clave ? { clave } : {}), denominacion: den,
        categoria: categoriaTexto(v(r, "categoria")) ?? categoriaDe(den), frecuencias: [], planes: {}, servicio: {}, ultimo: {},
        lanzamientos: null, horas: null, programadas: [],
      };
      activos.set(k, a);
    }
    const textoFrec = v(r, "frecuencia");
    const fs = frecuenciasDe(textoFrec);
    if (textoFrec && !fs.length) desconocidas.set(textoFrec, (desconocidas.get(textoFrec) ?? 0) + 1);
    const proxima = dia(v(r, "proxima")), ultimo = dia(v(r, "ultimo"));
    if (proxima === undefined || ultimo === undefined) fechasMalas++;
    for (const f of fs) {
      if (!a.frecuencias.includes(f)) a.frecuencias = FRECUENCIAS.filter((x) => x === f || a!.frecuencias.includes(x));
      const servicio = v(r, "servicio"), planSap = v(r, "planSap"), t = v(r, "tareas");
      if (servicio) a.servicio![f] = servicio;
      if (planSap) a.planes[f] = planSap;
      if (t) tareas[normalizar(servicio || nombrePlan(a.categoria, f))] = t;
      // la próxima fecha se guarda como "último = próxima − cada", así un servicio vencido sigue vencido
      if (proxima) { a.programadas.push({ fecha: proxima, frecuencias: [f] }); a.ultimo![f] = restarDias(proxima, DIAS_FRECUENCIA[f]); }
      if (ultimo) a.ultimo![f] = ultimo;
    }
  }
  if (!activos.size) return null;
  for (const a of activos.values()) a.programadas.sort((x, y) => x.fecha.localeCompare(y.fecha));

  const extra: Problema[] = [];
  if (desconocidas.size) extra.push({
    tipo: "frecuencia-desconocida",
    texto: `Frecuencias que no se reconocen: ${[...desconocidas].slice(0, 6).map(([t, n]) => `«${t}» (${n})`).join(", ")}. Usa 1M, 2M, 3M, 4M, 6M o 12M; esas filas no crean plan.`,
  });
  if (fechasMalas) extra.push({ tipo: "fecha-invalida", texto: `${fechasMalas} fila${fechasMalas === 1 ? "" : "s"} con una fecha que no se entiende (usa dd/mm/aaaa): ese plan arranca a partir de hoy.` });
  if (incompletas) extra.push({ tipo: "fila-incompleta", texto: `${incompletas} fila${incompletas === 1 ? "" : "s"} sin almacén o sin denominación: no se leen.` });
  return armarLectura("plantilla", hoja, [...activos.values()], extra, tareas);
}

// ── Plantilla para descargar ──────────────────────────────────────────────────────────────────────
const EJEMPLO: Record<string, [string, string, string]> = {
  moviles: ["102580", "Montacargas HP-ELE LI 01", "Montacargas"],
  infraestructura: ["27751", "Andén CDNQ 12", "Andén"],
  criticos: ["31044", "Mini split oficina 01", "Climatización"],
};

/** Excel de la plantilla: hoja Programa (con listas desplegables), Listas e Instrucciones. */
export function plantillaXlsx(pilar: string, almacenes: string[]) {
  const [sap, den, cat] = EJEMPLO[pilar] ?? EJEMPLO.moviles;
  const alm = almacenes[0] ?? "CDN 1";
  const col = (k: Campo) => CAMPOS.findIndex((c) => c.clave === k);
  const fila = (vals: Partial<Record<Campo, string>>) => CAMPOS.map((c) => vals[c.clave] ?? "");
  const categorias = Object.values(CATEGORIAS);
  return libroXlsx([
    {
      nombre: "Programa", fijarEncabezado: true,
      anchos: [16, 12, 12, 34, 22, 12, 15, 15, 26, 11, 40],
      filas: [
        CAMPOS.map((c) => c.etiqueta),
        fila({ almacen: alm, sap, denominacion: den, categoria: cat, frecuencia: "2M", proxima: "15/01/2027" }),
        fila({ almacen: alm, sap, denominacion: den, categoria: cat, frecuencia: "12M", proxima: "10/06/2027" }),
      ],
      listas: [
        { columna: col("almacen"), rango: `Listas!$A$2:$A$${almacenes.length + 1}` },
        { columna: col("frecuencia"), rango: `Listas!$B$2:$B$${FRECUENCIAS.length + 1}` },
        { columna: col("categoria"), rango: `Listas!$D$2:$D$${categorias.length + 1}` },
      ],
    },
    {
      nombre: "Listas", fijarEncabezado: true, anchos: [24, 12, 16, 26],
      filas: [["Almacenes", "Frecuencia", "Equivale a", "Categorías"],
        ...Array.from({ length: Math.max(almacenes.length, FRECUENCIAS.length, categorias.length) }, (_, i) => [
          almacenes[i] ?? "", FRECUENCIAS[i] ?? "", FRECUENCIAS[i] ? NOMBRE_FRECUENCIA[FRECUENCIAS[i]] : "", categorias[i] ?? "",
        ])],
    },
    {
      nombre: "Instrucciones", fijarEncabezado: true, anchos: [18, 13, 90],
      filas: [["Columna", "Obligatoria", "Qué poner"],
        ...CAMPOS.map((c) => [c.etiqueta, "requerido" in c && c.requerido ? "Sí" : "No", c.ayuda]),
        ["", "", ""],
        ["Una fila por frecuencia", "", "Si un activo lleva servicio bimestral y anual, van dos filas con el mismo SAP y almacén."],
        ["Volver a cargar", "", "Puedes subir el mismo archivo otra vez: los activos se reconocen por SAP o clave y no se duplican."],
      ],
    },
  ]);
}
