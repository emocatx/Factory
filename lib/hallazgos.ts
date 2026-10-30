/**
 * Hallazgos automáticos: frases con un número, su base y una acción, calculadas con reglas sobre las órdenes,
 * los equipos y los planes del pilar. Cada regla se calla si no hay evidencia suficiente. Funciones puras: la
 * carga de datos vive en lib/hallazgosDatos.ts, así se pueden probar sin la base.
 */
import { reincidencia, type FilaFalla } from "./analisis";
import { horas } from "./formato";

const DIA = 86_400_000;

export type Regla = "sin_asignar" | "vencidos" | "repetitiva" | "reincidente" | "sin_movimiento" | "calidad";

/** Orden en pantalla: lo urgente primero, luego lo que más paro evita. */
const PRIORIDAD: Record<Regla, number> = { sin_asignar: 1, vencidos: 2, repetitiva: 3, reincidente: 4, sin_movimiento: 5, calidad: 6 };

/** Umbrales de cada regla. Si cambian, anótalo en docs/producto.md → Hallazgos automáticos. */
export const UMBRALES = {
  ventanaDias: 30,
  repetitiva: { minFallas: 5, minGrupo: 3, minParte: 0.3, minFamilia: 0.6 },
  reincidente: { minFallas: 3, minRepeticiones: 2 },
  sinAsignarHoras: 24,
  sinMovimientoDias: 7,
  calidad: { minCerradas: 5, minParte: 0.2 },
};

export type Hallazgo = {
  clave: string;
  regla: Regla;
  tono: "paro" | "alerta" | "info";
  /** El hallazgo con su número y su base. */
  texto: string;
  /** Por qué importa o qué conviene hacer. */
  porque: string | null;
  accion: { texto: string; href: string } | null;
  /** Horas de paro (o cantidad) para ordenar dentro de la misma prioridad. */
  impacto: number;
};

export type FallaH = FilaFalla & { id_almacen: string | null; descripcion_falla: string | null };
export type AbiertaH = {
  id_orden: string; id_equipo: string | null; id_almacen: string | null; estatus_orden: string; fecha_ingreso: string;
  fecha_asignacion: string | null; fecha_inicio: string | null; asignado_a: string | null; importada: boolean | null;
};
export type VencidoH = { id_almacen: string | null; nombre_almacen: string | null; dias_restantes: number };

export type EntradaHallazgos = {
  ahora: number;
  /** Cómo se llama lo que se analiza: el pilar ("Móviles") o el almacén elegido. */
  alcance: string;
  /** Ruta del pilar, por ejemplo "/p/moviles". */
  base: string;
  /** Almacén elegido, para que los enlaces lo conserven. */
  almacen: string | null;
  /** Fallas de los últimos 90 días, sin canceladas (la reincidencia mira hacia atrás). */
  fallas: FallaH[];
  abiertas: AbiertaH[];
  /** Servicios preventivos con más de 7 días de atraso. */
  vencidos: VencidoH[];
  /** Categoría de cada equipo que la tiene (llega con el programa anual). */
  categorias: Map<string, string>;
  /** Nombres de los planes del pilar. */
  planes: string[];
  /** Admin, supervisor o coordinador: asignan órdenes, crean planes y cuidan el dato. */
  gestiona: boolean;
};

// ------------------------------------------------------------------ utilidades
const tiempo = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const dias = (ms: number) => Math.floor(ms / DIA);
const num = (n: number) => n.toLocaleString("es-MX");
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
/** Minúsculas y sin acentos, para comparar nombres. */
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** "Llantas y rodajas" → "llantas y rodajas"; respeta siglas ("PLC"). */
const enFrase = (s: string) => (s === s.toUpperCase() ? s : s.toLowerCase());
/** Horas de paro: reales si la falla está cerrada; transcurridas si sigue abierta. */
const horasDe = (f: FallaH) => Number(f.estatus_orden === "cerrada" ? f.tiempo_paro_horas ?? 0 : f.horas_transcurridas ?? 0);
const sumaHoras = (fs: FallaH[]) => fs.reduce((s, f) => s + horasDe(f), 0);

function enlace(e: EntradaHallazgos, ruta: string, extra: Record<string, string> = {}, ancla?: string) {
  const qs = new URLSearchParams({ ...(e.almacen ? { almacen: e.almacen } : {}), ...extra }).toString();
  return `${e.base}/${ruta}${qs ? `?${qs}` : ""}${ancla ? `#${ancla}` : ""}`;
}

/** Componentes que se reconocen en la descripción cuando la falla no trae componente. */
const TEMAS: [string, RegExp][] = [
  ["ruedas", /rueda|llanta/i],
  ["baterías", /bater[ií]a|cargador/i],
  ["frenos", /freno/i],
  ["cadenas y mástil", /cadena|m[aá]stil/i],
  ["sistema hidráulico", /hidr[aá]ul|manguera|aceite|fuga/i],
  ["motor", /motor/i],
  ["sistema eléctrico", /el[eé]ctric|cable|fusible|tarjeta/i],
];
const FAMILIAS: [string, RegExp][] = [
  ["transpaletas", /transpaleta/i],
  ["montacargas", /montacarga/i],
  ["apiladores", /apilador/i],
  ["tractores", /tractor/i],
];

const componenteDe = (f: FallaH) => f.nombre_modo?.trim() || TEMAS.find(([, rx]) => rx.test(f.descripcion_falla ?? ""))?.[0] || null;
const familiaDe = (f: FallaH, categorias: Map<string, string>) =>
  (f.id_equipo && categorias.get(f.id_equipo)) || FAMILIAS.find(([, rx]) => rx.test(f.nombre_equipo ?? ""))?.[0] || null;

/** El valor que reúne al menos `minParte` de la lista, o null si ninguno domina. */
function dominante(valores: (string | null)[], minParte: number) {
  const conteo = new Map<string, number>();
  for (const v of valores) if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1);
  const [mejor, n] = [...conteo].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return mejor && n / valores.length >= minParte ? mejor : null;
}

/** Cuántas abiertas vienen del historial importado, para avisar que quizá ya no siguen detenidas. */
function avisoImportadas(os: AbiertaH[]) {
  const k = os.filter((o) => o.importada).length;
  return k ? `${num(k)} ${plural(k, "viene", "vienen")} del historial importado: revisa si esos equipos siguen detenidos.` : null;
}

// ------------------------------------------------------------------ reglas
function sinAsignar(e: EntradaHallazgos): Hallazgo[] {
  if (!e.gestiona) return [];
  const os = e.abiertas
    .filter((o) => o.estatus_orden === "pendiente" && !o.asignado_a && e.ahora - tiempo(o.fecha_ingreso) > UMBRALES.sinAsignarHoras * 3_600_000)
    .sort((a, b) => tiempo(a.fecha_ingreso) - tiempo(b.fecha_ingreso));
  if (!os.length) return [];
  const d = dias(e.ahora - tiempo(os[0].fecha_ingreso));
  return [{
    clave: "sin_asignar",
    regla: "sin_asignar",
    tono: "paro",
    texto: `${num(os.length)} ${plural(os.length, "orden lleva", "órdenes llevan")} más de un día sin asignar; la más antigua, ${num(d)} ${plural(d, "día", "días")}.`,
    porque: avisoImportadas(os) ?? "Mientras nadie la tome, el equipo sigue detenido.",
    accion: { texto: "Asignar", href: enlace(e, "ordenes", { estado: "pendiente" }) },
    impacto: os.length,
  }];
}

function vencidos(e: EntradaHallazgos): Hallazgo[] {
  const n = e.vencidos.length;
  if (!n) return [];
  const porAlmacen = new Map<string, number>();
  for (const v of e.vencidos) { const k = v.nombre_almacen ?? "sin almacén"; porAlmacen.set(k, (porAlmacen.get(k) ?? 0) + 1); }
  const [top, nTop] = [...porAlmacen].sort((a, b) => b[1] - a[1])[0];
  const donde = e.almacen ? "" : porAlmacen.size === 1 ? ` en ${top}` : `; ${num(nTop)} en ${top}`;
  return [{
    clave: "vencidos",
    regla: "vencidos",
    tono: "alerta",
    texto: `${num(n)} ${plural(n, "servicio preventivo lleva", "servicios preventivos llevan")} más de 7 días ${plural(n, "vencido", "vencidos")}${donde}.`,
    porque: "Mientras no se hagan, esos equipos vuelven a fallar como correctivo.",
    accion: { texto: "Ver calendario", href: enlace(e, "planes", { vista: "calendario" }) },
    impacto: n,
  }];
}

function repetitiva(e: EntradaHallazgos, f30: FallaH[]): Hallazgo[] {
  const u = UMBRALES.repetitiva;
  if (f30.length < u.minFallas) return [];
  const grupos = new Map<string, { nombre: string; fallas: FallaH[] }>();
  for (const f of f30) {
    const nombre = componenteDe(f);
    if (!nombre) continue;
    const g = grupos.get(normal(nombre)) ?? { nombre, fallas: [] };
    g.fallas.push(f);
    grupos.set(normal(nombre), g);
  }
  return [...grupos.values()]
    .filter((g) => g.fallas.length >= u.minGrupo && g.fallas.length / f30.length >= u.minParte)
    // si ya hay un plan con ese nombre ("Inspección de ruedas"), la sugerencia ya se atendió
    .filter((g) => !e.planes.some((p) => normal(p).includes(normal(g.nombre).split(" ")[0])))
    .map((g) => {
      const comp = enFrase(g.nombre);
      const fam = dominante(g.fallas.map((f) => familiaDe(f, e.categorias)), u.minFamilia);
      const h = sumaHoras(g.fallas);
      return {
        clave: `repetitiva:${normal(g.nombre)}`,
        regla: "repetitiva" as const,
        tono: "info" as const,
        texto: `En ${e.alcance}, ${num(g.fallas.length)} de ${num(f30.length)} fallas de los últimos 30 días son de ${comp}${fam ? ` en ${enFrase(fam)}` : ""}${h >= 1 ? ` (${horas(h)} de paro)` : ""}.`,
        porque: `Una inspección semanal de ${comp} podría cambiarlas de correctivo a preventivo.`,
        accion: e.gestiona
          ? { texto: "Crear plan", href: enlace(e, "planes", { nuevo: `Inspección de ${comp}` }, "nuevo-plan") }
          : { texto: "Ver análisis", href: enlace(e, "analisis") },
        impacto: h,
      };
    });
}

function reincidente(e: EntradaHallazgos, f30: FallaH[]): Hallazgo[] {
  const u = UMBRALES.reincidente;
  const porEquipo = new Map<string, { nombre: string; fallas: FallaH[] }>();
  for (const f of f30) {
    if (!f.id_equipo) continue;
    const x = porEquipo.get(f.id_equipo) ?? { nombre: f.nombre_equipo ?? "Equipo sin nombre", fallas: [] };
    x.fallas.push(f);
    porEquipo.set(f.id_equipo, x);
  }
  // mismo componente que vuelve a fallar a menos de 30 días de la reparación anterior
  const rep = reincidencia(e.fallas, new Date(e.ahora - UMBRALES.ventanaDias * DIA).toISOString(), false, 30);
  const repDe = new Map<string, { veces: number; componente: string }>();
  for (const p of rep.pares) if ((repDe.get(p.clave)?.veces ?? 0) < p.veces) repDe.set(p.clave, { veces: p.veces, componente: p.componente });

  const candidatos = [...porEquipo]
    .filter(([id, x]) => x.fallas.length >= u.minFallas || (repDe.get(id)?.veces ?? 0) >= u.minRepeticiones)
    .map(([id, x]) => ({ id, ...x, h: sumaHoras(x.fallas) }))
    .sort((a, b) => b.h - a.h || b.fallas.length - a.fallas.length);
  if (!candidatos.length) return [];
  const c = candidatos[0];
  const r = repDe.get(c.id);
  const otros = candidatos.length - 1;
  return [{
    clave: `reincidente:${c.id}`,
    regla: "reincidente",
    tono: "alerta",
    texto: `${c.nombre} falló ${num(c.fallas.length)} ${plural(c.fallas.length, "vez", "veces")} en 30 días${c.h >= 1 ? ` (${horas(c.h)} de paro)` : ""}`
      + (r ? `; ${num(r.veces)} por ${enFrase(r.componente)} a menos de 30 días de repararse.` : "."),
    porque: `Conviene revisar la causa de fondo antes de la siguiente reparación${otros ? `; hay ${num(otros)} ${plural(otros, "equipo más", "equipos más")} en la misma situación` : ""}.`,
    accion: { texto: "Ver en análisis", href: enlace(e, "analisis", { equipo: c.id }) },
    impacto: c.h,
  }];
}

function sinMovimiento(e: EntradaHallazgos): Hallazgo[] {
  if (!e.gestiona) return [];
  const ultimo = (o: AbiertaH) => Math.max(tiempo(o.fecha_ingreso), tiempo(o.fecha_asignacion), tiempo(o.fecha_inicio));
  const os = e.abiertas
    .filter((o) => o.estatus_orden !== "pendiente" && e.ahora - ultimo(o) > UMBRALES.sinMovimientoDias * DIA)
    .sort((a, b) => ultimo(a) - ultimo(b));
  if (!os.length) return [];
  const d = dias(e.ahora - ultimo(os[0]));
  return [{
    clave: "sin_movimiento",
    regla: "sin_movimiento",
    tono: "alerta",
    texto: `${num(os.length)} ${plural(os.length, "orden asignada o en proceso lleva", "órdenes asignadas o en proceso llevan")} más de 7 días sin moverse; la más quieta, ${num(d)} ${plural(d, "día", "días")}.`,
    porque: avisoImportadas(os) ?? "Revisa si esperan refacciones o si ya se repararon y faltó liberarlas.",
    accion: { texto: "Revisar órdenes", href: enlace(e, "ordenes") },
    impacto: os.length,
  }];
}

function calidad(e: EntradaHallazgos, f30: FallaH[]): Hallazgo[] {
  if (!e.gestiona) return [];
  const cerradas = f30.filter((f) => f.estatus_orden === "cerrada");
  const sinModo = cerradas.filter((f) => !f.id_modo).length;
  const sinCausa = cerradas.filter((f) => !f.id_origen).length;
  const u = UMBRALES.calidad;
  if (cerradas.length < u.minCerradas || Math.max(sinModo, sinCausa) / cerradas.length < u.minParte) return [];
  const partes = [
    sinModo ? `${num(sinModo)} no ${plural(sinModo, "tiene", "tienen")} componente` : null,
    sinCausa ? `${num(sinCausa)} no ${plural(sinCausa, "tiene", "tienen")} causa` : null,
  ].filter(Boolean);
  return [{
    clave: "calidad",
    regla: "calidad",
    tono: "info",
    texto: `De ${num(cerradas.length)} fallas cerradas en 30 días, ${partes.join(" y ")}.`,
    porque: "Sin eso los hallazgos adivinan por palabras: al liberar una orden, elige siempre el componente y la causa.",
    accion: { texto: "Ver análisis", href: enlace(e, "analisis") },
    impacto: Math.max(sinModo, sinCausa),
  }];
}

/** Todos los hallazgos, del más urgente al menos. Cada pantalla decide cuántos muestra. */
export function calcularHallazgos(e: EntradaHallazgos): Hallazgo[] {
  const desde = e.ahora - UMBRALES.ventanaDias * DIA;
  const f30 = e.fallas.filter((f) => tiempo(f.fecha_ingreso) >= desde);
  return [...sinAsignar(e), ...vencidos(e), ...repetitiva(e, f30), ...reincidente(e, f30), ...sinMovimiento(e), ...calidad(e, f30)]
    .sort((a, b) => PRIORIDAD[a.regla] - PRIORIDAD[b.regla] || b.impacto - a.impacto);
}
