import "server-only";
import { createClient } from "@/lib/supabase/server";
import { catalogosPilar, todasLasPaginas } from "@/lib/datos";
import { ESTADOS_ABIERTOS } from "@/lib/catalogos";
import type { Indicadores, Pilar, Rol } from "@/lib/tipos";
import { NAVES_EN_ESCENA, PERIODOS_HOME } from "@/lib/homeComun";

/*
 * Datos del home visual (Resumen de Móviles). Todo se lee con la sesión del usuario, así que el RLS
 * decide qué ve cada quien (empresa y pilares); aquí no se escribe nada.
 */

const DIA = 86_400_000;
/** Tope de equipos operando que se mandan por almacén para dibujar la nave por dentro. */
const MAX_EQUIPOS_NAVE = 120;

export type Ind = { disp: number | null; mttr: number | null; mtbf: number | null };
export type EnTaller = { idOrden: string; folio: string; equipo: string; modelo: string | null; dias: number; falla: string };
export type Resumen = {
  total: number;
  paro: number;
  externos: number;
  fallas: number;
  fallasPrevias: number;
  origen: [string, number] | null;
  peor: [string, number] | null;
  taller: EnTaller[];
};
export type Almacen = Resumen & {
  id: string;
  nombre: string;
  /** Modelo de cada equipo en taller y de cada uno que opera ([modelo, rentado]). */
  detenidos: string[];
  operando: [string, boolean][];
  ind: Ind | null;
};
export type Accion = { texto: string; href: string } | null;
export type DatosHome = {
  periodo: { v: string; dias: number; nombre: string };
  global: Resumen & { ind: Ind; almacenesConParo: number };
  almacenes: Almacen[];
  metas: { disponibilidad: number | null; mttr: number | null; mtbf: number | null };
  hallazgo: string;
  accion: Accion;
  /** Para la acción secundaria: quien puede registrar ve "Registrar falla". */
  puedeRegistrar: boolean;
  actualizado: string;
};


type OrdenAbierta = { id_orden: string; folio_ticket: string; id_equipo: string | null; id_almacen: string | null; nombre_equipo: string | null; descripcion_falla: string; fecha_ingreso: string; estatus_orden: string; asignado_a: string | null };
type OrdenReciente = { id_almacen: string | null; id_equipo: string | null; fecha_ingreso: string; nombre_origen: string | null; nombre_equipo: string | null };

const top = (m: Map<string, number>): [string, number] | null => {
  let mejor: [string, number] | null = null;
  for (const [k, n] of m) if (!mejor || n > mejor[1]) mejor = [k, n];
  return mejor;
};
const suma = (m: Map<string, number>, k: string | null | undefined) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
const aInd = (i: Indicadores | null): Ind => ({ disp: i?.disponibilidad_pct ?? null, mttr: i?.mttr_horas ?? null, mtbf: i?.mtbf_horas ?? null });

export async function indicadoresDe(pilar: Pilar, desde: string, idAlmacen: string | null): Promise<Ind> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("indicadores", { p_pilar: pilar, p_id_linea: null, p_id_almacen: idAlmacen, p_desde: desde, p_hasta: null }).single();
  return aInd(data as Indicadores | null);
}

export async function datosHome({ pilar, periodo: pv, rol, idUsuario, metas }: {
  pilar: Pilar; periodo?: string; rol: Rol; idUsuario: string;
  metas: { disponibilidad: number | null; mttr: number | null; mtbf: number | null };
}): Promise<DatosHome> {
  const periodo = PERIODOS_HOME.find((x) => x.v === pv) ?? PERIODOS_HOME[2];
  const ahora = Date.now();
  const desde = ahora - periodo.dias * DIA;
  const desdePrevio = desde - periodo.dias * DIA;
  const desde90 = ahora - 90 * DIA;
  const supabase = await createClient();

  const [cat, { data: abiertas }, { data: recientes }, indGlobal] = await Promise.all([
    catalogosPilar(pilar),
    todasLasPaginas<OrdenAbierta>((a, b) => supabase.from("v_ordenes_detalle")
      .select("id_orden, folio_ticket, id_equipo, id_almacen, nombre_equipo, descripcion_falla, fecha_ingreso, estatus_orden, asignado_a")
      .eq("pilar", pilar).in("estatus_orden", ESTADOS_ABIERTOS).order("fecha_ingreso").range(a, b)),
    todasLasPaginas<OrdenReciente>((a, b) => supabase.from("v_ordenes_detalle")
      .select("id_almacen, id_equipo, fecha_ingreso, nombre_origen, nombre_equipo")
      .eq("pilar", pilar).neq("estatus_orden", "cancelada").gte("fecha_ingreso", new Date(Math.min(desde90, desdePrevio)).toISOString())
      .order("fecha_ingreso").range(a, b)),
    indicadoresDe(pilar, new Date(desde).toISOString(), null),
  ]);

  // modelo y propiedad de cada equipo (catalogosPilar no trae modelo)
  const { data: extra } = await todasLasPaginas<{ id_equipo: string; modelo: string | null }>((a, b) =>
    supabase.from("equipos").select("id_equipo, modelo").eq("tipo_pilar", pilar).neq("estatus", "baja").order("id_equipo").range(a, b));
  const modelo = new Map(extra.map((e) => [e.id_equipo, e.modelo]));
  const almacenDeEquipo = new Map(cat.equipos.map((e) => [e.id_equipo, e.id_almacen]));
  const nombreAlmacen = new Map(cat.almacenes.map((a) => [a.id_almacen, a.nombre_almacen]));

  // Una orden abierta por equipo cuenta como "en taller"; se agrupa por el almacén del equipo.
  const enTaller = new Map<string, EnTaller[]>();
  const equiposEnTaller = new Set<string>();
  for (const o of abiertas) {
    const alm = (o.id_equipo && almacenDeEquipo.get(o.id_equipo)) || o.id_almacen;
    if (!alm) continue;
    if (o.id_equipo) equiposEnTaller.add(o.id_equipo);
    const lista = enTaller.get(alm) ?? [];
    lista.push({
      idOrden: o.id_orden, folio: o.folio_ticket, equipo: o.nombre_equipo ?? "Sin equipo",
      modelo: o.id_equipo ? modelo.get(o.id_equipo) ?? null : null,
      dias: Math.max(0, Math.floor((ahora - new Date(o.fecha_ingreso).getTime()) / DIA)),
      falla: o.descripcion_falla,
    });
    enTaller.set(alm, lista);
  }

  const resumenVacio = (): Resumen => ({ total: 0, paro: 0, externos: 0, fallas: 0, fallasPrevias: 0, origen: null, peor: null, taller: [] });
  const porAlm = new Map<string, Resumen & { origenes: Map<string, number>; peores: Map<string, number>; op: [string, boolean][] }>();
  const obtener = (id: string) => {
    let r = porAlm.get(id);
    if (!r) { r = { ...resumenVacio(), origenes: new Map(), peores: new Map(), op: [] }; porAlm.set(id, r); }
    return r;
  };
  for (const e of cat.equipos) {
    const r = obtener(e.id_almacen);
    r.total++;
    if (e.propiedad !== "propio") r.externos++;
    if (!equiposEnTaller.has(e.id_equipo)) {
      r.op.push([modelo.get(e.id_equipo) ?? "", e.propiedad !== "propio"]);
    }
  }
  for (const [alm, lista] of enTaller) obtener(alm).taller = lista;

  const g = { origenes: new Map<string, number>(), peores: new Map<string, number>(), fallas: 0, previas: 0 };
  const nombreEquipo = new Map<string, string>();
  /** [nombre del equipo (y su almacén si se pide), fallas] del equipo con más fallas. */
  const peorEquipo = (m: Map<string, number>, conAlmacen: boolean): [string, number] | null => {
    const t = top(m);
    if (!t) return null;
    const alm = almacenDeEquipo.get(t[0]);
    const nombre = nombreEquipo.get(t[0]) ?? "Sin nombre";
    return [conAlmacen && alm ? `${nombre} · ${nombreAlmacen.get(alm) ?? ""}` : nombre, t[1]];
  };
  for (const o of recientes) {
    const t = new Date(o.fecha_ingreso).getTime();
    const alm = (o.id_equipo && almacenDeEquipo.get(o.id_equipo)) || o.id_almacen;
    const r = alm ? obtener(alm) : null;
    if (t >= desde) {
      g.fallas++; suma(g.origenes, o.nombre_origen);
      if (r) { r.fallas++; suma(r.origenes, o.nombre_origen); }
    } else if (t >= desdePrevio) {
      g.previas++;
      if (r) r.fallasPrevias++;
    }
    // por id de equipo (dos equipos pueden llamarse igual); el nombre se pone al final
    if (t >= desde90 && o.id_equipo) {
      suma(g.peores, o.id_equipo); if (r) suma(r.peores, o.id_equipo);
      if (!nombreEquipo.has(o.id_equipo)) nombreEquipo.set(o.id_equipo, o.nombre_equipo ?? "Sin nombre");
    }
  }

  const almacenes: Almacen[] = [...porAlm.entries()]
    .filter(([id, r]) => r.total > 0 && nombreAlmacen.has(id))
    .map(([id, r]) => {
      return {
        id, nombre: nombreAlmacen.get(id)!, total: r.total, paro: r.taller.length, externos: r.externos,
        fallas: r.fallas, fallasPrevias: r.fallasPrevias, origen: top(r.origenes), peor: peorEquipo(r.peores, false),
        taller: r.taller, detenidos: r.taller.map((x) => x.modelo ?? ""), operando: r.op.slice(0, MAX_EQUIPOS_NAVE), ind: null,
      };
    })
    .sort((a, b) => b.paro - a.paro || b.total - a.total);

  // Indicadores oficiales de las naves que se dibujan (los demás se piden al elegirlos).
  const enEscena = almacenes.slice(0, NAVES_EN_ESCENA);
  const inds = await Promise.all(enEscena.map((a) => indicadoresDe(pilar, new Date(desde).toISOString(), a.id)));
  enEscena.forEach((a, k) => { a.ind = inds[k]; });

  const global = {
    total: cat.equipos.length,
    paro: equiposEnTaller.size,
    externos: cat.equipos.filter((e) => e.propiedad !== "propio").length,
    fallas: g.fallas, fallasPrevias: g.previas, origen: top(g.origenes), peor: peorEquipo(g.peores, true),
    taller: abiertas.map((o) => ({
      idOrden: o.id_orden, folio: o.folio_ticket, equipo: o.nombre_equipo ?? "Sin equipo",
      modelo: o.id_equipo ? modelo.get(o.id_equipo) ?? null : null,
      dias: Math.max(0, Math.floor((ahora - new Date(o.fecha_ingreso).getTime()) / DIA)), falla: o.descripcion_falla,
    })),
    ind: indGlobal,
    almacenesConParo: almacenes.filter((a) => a.paro > 0).length,
  };

  // Hallazgo y acción principal según el rol: lo que esa persona necesita ver primero.
  const base = `/p/${pilar}`;
  const sinAsignar = abiertas.filter((o) => o.estatus_orden === "pendiente" && !o.asignado_a);
  const mias = abiertas.filter((o) => o.asignado_a === idUsuario);
  const peor = almacenes[0];
  const diasDe = (iso: string) => Math.floor((ahora - new Date(iso).getTime()) / DIA);
  const puedeRegistrar = rol !== "lector" && rol !== "gerente";
  let hallazgo = peor && peor.paro > 0
    ? `${peor.nombre} tiene ${peor.paro} de ${peor.total} equipos en taller (${Math.round((100 * peor.paro) / peor.total)}%)`
    : "Ningún equipo en taller";
  let accion: Accion = puedeRegistrar ? { texto: "Registrar falla", href: `${base}/registro` } : { texto: "Ver indicadores", href: `${base}/indicadores` };
  if ((rol === "supervisor" || rol === "coordinador") && sinAsignar.length) {
    hallazgo = `${sinAsignar.length} orden${sinAsignar.length === 1 ? "" : "es"} sin asignar; la más antigua lleva ${diasDe(sinAsignar[0].fecha_ingreso)} días`;
    accion = { texto: "Asignar órdenes", href: `${base}/ordenes` };
  } else if (rol === "tecnico") {
    hallazgo = mias.length ? `Tienes ${mias.length} orden${mias.length === 1 ? "" : "es"} asignada${mias.length === 1 ? "" : "s"}` : "No tienes órdenes asignadas";
    accion = mias.length ? { texto: "Mis órdenes", href: `${base}/ordenes` } : { texto: "Registrar falla", href: `${base}/registro` };
  }

  return { periodo, global, almacenes, metas, hallazgo, accion, puedeRegistrar, actualizado: new Date(ahora).toISOString() };
}
