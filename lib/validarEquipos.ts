// Validador del programa contra lo que ya está en Factory: antes de cargar, dice qué equipos del archivo ya existen
// (y si coinciden), cuáles son nuevos, cuáles parecen repetidos y qué equipos de Factory no vienen en el archivo.
// Empata igual que cargar_programa_anual: SAP del mismo pilar → clave → almacén + nombre exacto (sin mayúsculas).
// También cruza el historial: cuántas órdenes de Mantto tiene cada equipo, para ver que el plan caiga en los equipos
// que ya tienen historial y no cree otros. Solo compara; no guarda nada.

import { normalizar, type Carga } from "./planAnual";

export type EquipoFactory = {
  id: string; pilar: string; alm: string | null; sap: string | null; clave: string | null;
  nombre: string; cat: string | null; estatus: string;
  /** Órdenes de Mantto ligadas al equipo (su historial). */
  ordenes: number;
};

type Ficha = { sap: string | null; clave: string | null; nombre: string; alm: string | null; cat: string | null; ordenes: number };

export type Diferencia = "almacen" | "nombre" | "categoria";

export type Coincidencia = {
  /** i del activo en la carga. */
  i: number;
  tipo: "igual" | "diferente" | "baja" | "nuevo" | "posible-duplicado" | "sap-otro-pilar" | "repetido";
  /** Por qué empató: sap, clave o nombre. */
  por?: "sap" | "clave" | "nombre";
  diferencias?: Diferencia[];
  /** Equipo de Factory con el que empató o al que se parece. */
  equipo?: Ficha;
};

export type Validacion = {
  conteo: Record<Coincidencia["tipo"], number>;
  coincidencias: Coincidencia[];
  /** Equipos activos de Factory, del pilar y de los almacenes del archivo, que el archivo no trae. */
  sinArchivo: Ficha[];
  /** Equipos con órdenes y cuántas órdenes: los que el plan liga, los que no trae y los de almacenes que no vienen en el archivo. */
  historial: Record<"ligado" | "sinArchivo" | "fuera" | "parecido", { equipos: number; ordenes: number }>;
};

/** Nombre para buscar parecidos: sin acentos, mayúsculas, espacios, guiones ni puntos ("Montacargas 01" = "MONTACARGAS-01"). */
const clavePareja = (s: string) => normalizar(s).replace(/[\s\-_.#/]+/g, "");

export function validarEquipos(activos: Carga["activos"], existentes: EquipoFactory[], pilar: string): Validacion {
  const delPilar = existentes.filter((e) => e.pilar === pilar);
  const porSap = new Map<string, EquipoFactory>(), porClave = new Map<string, EquipoFactory>();
  const porNombre = new Map<string, EquipoFactory>(), parecidos = new Map<string, EquipoFactory>();
  for (const e of delPilar) {
    if (e.sap && !porSap.has(e.sap)) porSap.set(e.sap, e);
    if (e.clave && !porClave.has(e.clave)) porClave.set(e.clave, e);
    const k = `${e.alm}|${e.nombre.toLowerCase()}`;
    if (!porNombre.has(k)) porNombre.set(k, e);
    const p = `${e.alm}|${clavePareja(e.nombre)}`;
    if (e.estatus !== "baja" && !parecidos.has(p)) parecidos.set(p, e);
  }
  const sapAjeno = new Set(existentes.filter((e) => e.pilar !== pilar && e.sap).map((e) => e.sap!));
  const ficha = (e: EquipoFactory): Ficha => ({ sap: e.sap, clave: e.clave, nombre: e.nombre, alm: e.alm, cat: e.cat, ordenes: e.ordenes });

  const usados = new Map<string, number>(), ids: (string | null)[] = [], parecidosUsados = new Set<string>();
  const coincidencias: Coincidencia[] = activos.map((a, k) => {
    // la clave sale como en la base: la del archivo o, si no trae, el consecutivo (MOV-784)
    const sap = a.sap?.trim() || null, nombre = a.nombre.trim();
    const clave = a.clave?.trim().slice(0, 40) || (a.cons !== null ? `${pilar.slice(0, 3).toUpperCase()}-${a.cons}` : null);
    const [e, por] =
      sap && porSap.has(sap) ? [porSap.get(sap)!, "sap" as const] :
      clave && porClave.has(clave) ? [porClave.get(clave)!, "clave" as const] :
      porNombre.has(`${a.alm}|${nombre.toLowerCase()}`) ? [porNombre.get(`${a.alm}|${nombre.toLowerCase()}`)!, "nombre" as const] :
      [null, undefined];
    ids[k] = e?.id ?? null;
    if (!e) {
      if (sap && sapAjeno.has(sap)) return { i: a.i, tipo: "sap-otro-pilar" };
      const p = parecidos.get(`${a.alm}|${clavePareja(nombre)}`);
      if (p) parecidosUsados.add(p.id);
      return p ? { i: a.i, tipo: "posible-duplicado", equipo: ficha(p) } : { i: a.i, tipo: "nuevo" };
    }
    usados.set(e.id, (usados.get(e.id) ?? 0) + 1);
    const diferencias: Diferencia[] = [];
    if (e.alm !== a.alm) diferencias.push("almacen");
    if (e.nombre.trim() !== nombre) diferencias.push("nombre");
    // sin categoría en Factory no es diferencia: la carga solo se la pone
    if (e.cat && e.cat !== a.cat) diferencias.push("categoria");
    const tipo = e.estatus === "baja" ? "baja" : diferencias.length ? "diferente" : "igual";
    return { i: a.i, tipo, por, diferencias, equipo: ficha(e) };
  });

  // Dos filas del archivo que caen en el mismo equipo de Factory: la segunda pisaría a la primera
  const vistos = new Set<string>();
  coincidencias.forEach((c, k) => {
    const id = ids[k];
    if (!id) return;
    if ((usados.get(id) ?? 0) > 1 && vistos.has(id)) c.tipo = "repetido";
    vistos.add(id);
  });

  // los que ya salen como posible duplicado no se cuentan otra vez como "no viene en el archivo"
  const empatados = new Set([...usados.keys(), ...parecidosUsados]);
  const almacenes = new Set(activos.map((a) => a.alm));
  const sinArchivo = delPilar
    .filter((e) => e.estatus !== "baja" && !empatados.has(e.id) && e.alm && almacenes.has(e.alm))
    .map(ficha);

  const suma = (es: { ordenes: number }[]) => ({ equipos: es.length, ordenes: es.reduce((t, e) => t + e.ordenes, 0) });
  const conOrdenes = delPilar.filter((e) => e.ordenes > 0);
  const historial = {
    ligado: suma(conOrdenes.filter((e) => usados.has(e.id))),
    parecido: suma(conOrdenes.filter((e) => parecidosUsados.has(e.id))),
    sinArchivo: suma(sinArchivo.filter((e) => e.ordenes > 0)),
    fuera: suma(conOrdenes.filter((e) => !e.alm || !almacenes.has(e.alm))),
  };

  const conteo = { igual: 0, diferente: 0, baja: 0, nuevo: 0, "posible-duplicado": 0, "sap-otro-pilar": 0, repetido: 0 };
  for (const c of coincidencias) conteo[c.tipo]++;
  return { conteo, coincidencias, sinArchivo, historial };
}
