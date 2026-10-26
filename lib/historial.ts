/**
 * Conversión de un historial de fallas (Excel / CSV) a órdenes listas para importar.
 *
 * Acepta dos formas comunes:
 *  1. Bitácora de eventos: una fila por movimiento con "Tipo de evento" = Ingreso / Salida
 *     (como la lista de SharePoint "Eventos"). Se emparejan por equipo en orden cronológico.
 *  2. Una fila por falla con "Fecha de ingreso" y "Fecha de cierre".
 *
 * Funciones puras: se usan en el navegador para la vista previa y se pueden probar sin servidor.
 */

export type Fila = Record<string, string>;
export type OrdenFecha = "dmy" | "mdy";

export type EquipoRef = { id: string; sap: string | null; serie?: string | null; clave: string | null; nombre: string; id_almacen: string };
export type Catalogo = { id: string; nombre: string };

export type OrdenImport = {
  ref: string;
  id_equipo: string;
  equipo: string;
  id_almacen: string | null;
  almacen: string;
  id_origen: string | null;
  origen: string;
  id_modo: string | null;
  descripcion: string;
  solicitante: string;
  recibe: string;
  fecha_ingreso: string; // ISO con zona
  fecha_cierre: string | null;
  horas: number | null;
  filas: number[]; // filas de origen (1 = primera de datos)
};

export type Aviso = { fila: number; texto: string; grave: boolean };

export type Resultado = {
  modo: "eventos" | "fallas";
  ordenFecha: OrdenFecha;
  cerradas: OrdenImport[];
  abiertas: OrdenImport[];
  avisos: Aviso[];
  /** Textos de causa que no están en el catálogo, con cuántas veces aparecen. */
  causasSinCatalogo: [string, number][];
};

/** Columnas reconocidas (encabezados equivalentes en `alias`). */
export const COLUMNAS_HISTORIAL = [
  { clave: "sap", etiqueta: "SAP o serie", alias: ["sap", "serie", "serie sap", "no serie", "equipolookup", "equipo sap", "no sap", "numero sap"] },
  { clave: "nombre", etiqueta: "Equipo", alias: ["titulo", "equipo", "nombre equipo", "nombre", "activo"] },
  { clave: "clave", etiqueta: "Clave", alias: ["clave interna", "codigo"] },
  { clave: "tipo", etiqueta: "Tipo de evento", alias: ["tipoevento", "tipo evento", "evento", "movimiento"] },
  { clave: "fecha", etiqueta: "Fecha", alias: ["fechahora", "fecha hora", "fecha ingreso", "fecha_ingreso", "fecha de ingreso", "inicio", "fecha paro"] },
  { clave: "fecha_cierre", etiqueta: "Fecha de cierre", alias: ["fecha cierre", "fecha de cierre", "fecha salida", "fecha liberacion", "cierre", "fin"] },
  { clave: "almacen", etiqueta: "Almacén", alias: ["almacen", "almacenlookup", "cedis", "sitio", "ubicacion"] },
  { clave: "origen", etiqueta: "Causa", alias: ["origen_falla", "origen falla", "origen", "causa", "tipo falla", "origenfallalookup"] },
  { clave: "modo", etiqueta: "Componente", alias: ["componente", "modo", "modo falla", "que fallo"] },
  { clave: "descripcion", etiqueta: "Descripción", alias: ["descripcion_falla", "descripcion falla", "descripcion", "falla", "detalle"] },
  { clave: "solicitante", etiqueta: "Solicitante", alias: ["solicita", "reporta"] },
  { clave: "recibe", etiqueta: "Recibe", alias: ["recibio", "atiende", "tecnico"] },
  { clave: "folio", etiqueta: "Folio", alias: ["folio_ticket", "ticket", "folio ticket"] },
] as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const suave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const RX_NUM = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?)?$/i;
const RX_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Detecta si las fechas vienen día/mes o mes/día. Si no hay forma de saberlo, día/mes (México). */
export function detectarOrdenFecha(valores: string[]): OrdenFecha {
  let dmy = 0, mdy = 0;
  for (const v of valores) {
    const m = RX_NUM.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    else if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** Convierte texto a ISO con la zona indicada (por omisión, hora del centro de México). */
export function leerFecha(v: string, orden: OrdenFecha, zona = "-06:00"): string | null {
  const t = v.trim();
  if (!t) return null;
  let a: number, mes: number, dia: number, h = 0, mi = 0, s = 0;
  const iso = RX_ISO.exec(t);
  if (iso) {
    [a, mes, dia] = [+iso[1], +iso[2], +iso[3]];
    h = +(iso[4] ?? 0); mi = +(iso[5] ?? 0); s = +(iso[6] ?? 0);
  } else {
    const m = RX_NUM.exec(t);
    if (!m) return null;
    const [x, y] = [+m[1], +m[2]];
    [dia, mes] = orden === "dmy" ? [x, y] : [y, x];
    a = +m[3]; if (a < 100) a += 2000;
    h = +(m[4] ?? 0); mi = +(m[5] ?? 0); s = +(m[6] ?? 0);
    const ampm = m[7]?.toLowerCase().replace(/[^ap]/g, "");
    if (ampm === "p" && h < 12) h += 12;
    if (ampm === "a" && h === 12) h = 0;
  }
  const f = new Date(Date.UTC(a, mes - 1, dia, h, mi, s));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia || h > 23 || mi > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${a}-${p(mes)}-${p(dia)}T${p(h)}:${p(mi)}:${p(s)}${zona}`;
}

function tipoEvento(v: string): "ingreso" | "salida" | null {
  const n = norm(v);
  if (!n) return null;
  if (/^(ingreso|entrada|alta|paro|falla|apertura|abierta)/.test(n)) return "ingreso";
  if (/^(salida|liberacion|liberado|cierre|cerrada|baja|fin)/.test(n)) return "salida";
  return null;
}

export function convertirHistorial(
  filas: Fila[],
  cat: { equipos: EquipoRef[]; almacenes: Catalogo[]; origenes: Catalogo[]; modos: Catalogo[] },
  ordenForzado?: OrdenFecha,
): Resultado {
  const porSap = new Map<string, EquipoRef>(), porClave = new Map<string, EquipoRef>(), porNombre = new Map<string, EquipoRef>();
  for (const e of cat.equipos) {
    if (e.sap && !porSap.has(suave(e.sap))) porSap.set(suave(e.sap), e);
    // Los archivos viejos traen la serie en la columna "Serie SAP": también la reconoce.
    if (e.serie && !porSap.has(suave(e.serie))) porSap.set(suave(e.serie), e);
    if (e.clave && !porClave.has(suave(e.clave))) porClave.set(suave(e.clave), e);
    if (!porNombre.has(norm(e.nombre))) porNombre.set(norm(e.nombre), e);
  }
  const almacenes = new Map(cat.almacenes.map((a) => [suave(a.nombre), a]));
  const almacenesN = new Map(cat.almacenes.map((a) => [norm(a.nombre), a]));
  const nombreAlm = new Map(cat.almacenes.map((a) => [a.id, a.nombre]));
  const origenes = new Map(cat.origenes.map((o) => [norm(o.nombre), o]));
  const modos = new Map(cat.modos.map((o) => [norm(o.nombre), o]));

  const ordenFecha = ordenForzado ?? detectarOrdenFecha(filas.flatMap((f) => [f.fecha ?? "", f.fecha_cierre ?? ""]));
  const conTipo = filas.some((f) => tipoEvento(f.tipo ?? ""));
  const modo: Resultado["modo"] = conTipo ? "eventos" : "fallas";
  const avisos: Aviso[] = [];
  const causasSin = new Map<string, number>();

  const buscarEquipo = (f: Fila) =>
    (f.sap && porSap.get(suave(f.sap))) || (f.clave && porClave.get(suave(f.clave))) ||
    (f.sap && porClave.get(suave(f.sap))) || (f.nombre && porNombre.get(norm(f.nombre))) || null;

  type Ev = { n: number; f: Fila; eq: EquipoRef; fecha: string; tipo: "ingreso" | "salida" };
  const eventos: Ev[] = [];
  filas.forEach((f, i) => {
    const n = i + 1;
    const eq = buscarEquipo(f);
    if (!eq) {
      avisos.push({ fila: n, grave: true, texto: `Equipo no encontrado (${[f.sap, f.nombre].filter(Boolean).join(" · ") || "sin dato"}). Dalo de alta primero.` });
      return;
    }
    const fecha = leerFecha(f.fecha ?? "", ordenFecha);
    if (!fecha) { avisos.push({ fila: n, grave: true, texto: `Fecha inválida o vacía: "${f.fecha ?? ""}".` }); return; }
    if (modo === "eventos") {
      const tipo = tipoEvento(f.tipo ?? "");
      if (!tipo) { avisos.push({ fila: n, grave: true, texto: `Tipo de evento no reconocido: "${f.tipo ?? ""}" (usa Ingreso o Salida).` }); return; }
      eventos.push({ n, f, eq, fecha, tipo });
    } else {
      eventos.push({ n, f, eq, fecha, tipo: "ingreso" });
    }
  });

  const armar = (ing: Ev, cierre: string | null, filasOrigen: number[]): OrdenImport => {
    const f = ing.f;
    const textoAlm = (f.almacen ?? "").trim();
    let alm = textoAlm ? almacenes.get(suave(textoAlm)) ?? almacenesN.get(norm(textoAlm)) : undefined;
    if (textoAlm && !alm) avisos.push({ fila: ing.n, grave: false, texto: `Almacén "${textoAlm}" no existe; se usa el del equipo.` });
    if (!alm) alm = { id: ing.eq.id_almacen, nombre: nombreAlm.get(ing.eq.id_almacen) ?? "" };
    const textoCausa = (f.origen ?? "").trim();
    const causa = textoCausa ? origenes.get(norm(textoCausa)) : undefined;
    if (textoCausa && !causa) causasSin.set(textoCausa, (causasSin.get(textoCausa) ?? 0) + 1);
    const textoModo = (f.modo ?? "").trim();
    const comp = textoModo ? modos.get(norm(textoModo)) : undefined;
    const horas = cierre ? Math.round(((Date.parse(cierre) - Date.parse(ing.fecha)) / 36e5) * 100) / 100 : null;
    if (horas !== null && horas > 720) avisos.push({ fila: ing.n, grave: false, texto: `Paro de ${Math.round(horas / 24)} días; revisa que la salida sea la correcta.` });
    return {
      ref: (f.folio ?? "").trim() || `${ing.eq.serie || ing.eq.sap || ing.eq.clave || ing.eq.nombre}|${ing.fecha}`,
      id_equipo: ing.eq.id,
      equipo: ing.eq.nombre,
      id_almacen: alm.id,
      almacen: alm.nombre,
      id_origen: causa?.id ?? null,
      origen: causa?.nombre ?? (textoCausa ? `${textoCausa} (sin clasificar)` : "Sin clasificar"),
      id_modo: comp?.id ?? null,
      descripcion: (f.descripcion ?? "").trim(),
      solicitante: (f.solicitante ?? "").trim(),
      recibe: (f.recibe ?? "").trim(),
      fecha_ingreso: ing.fecha,
      fecha_cierre: cierre,
      horas,
      filas: filasOrigen,
    };
  };

  const cerradas: OrdenImport[] = [], abiertas: OrdenImport[] = [];

  if (modo === "fallas") {
    for (const e of eventos) {
      const tc = (e.f.fecha_cierre ?? "").trim();
      const cierre = tc ? leerFecha(tc, ordenFecha) : null;
      if (tc && !cierre) { avisos.push({ fila: e.n, grave: true, texto: `Fecha de cierre inválida: "${tc}".` }); continue; }
      if (cierre && Date.parse(cierre) < Date.parse(e.fecha)) { avisos.push({ fila: e.n, grave: true, texto: "El cierre es anterior al ingreso." }); continue; }
      (cierre ? cerradas : abiertas).push(armar(e, cierre, [e.n]));
    }
  } else {
    const porEquipo = new Map<string, Ev[]>();
    for (const e of eventos) porEquipo.set(e.eq.id, [...(porEquipo.get(e.eq.id) ?? []), e]);
    for (const lista of porEquipo.values()) {
      lista.sort((x, y) => Date.parse(x.fecha) - Date.parse(y.fecha) || (x.tipo === y.tipo ? x.n - y.n : x.tipo === "ingreso" ? -1 : 1));
      let abierto: Ev | null = null;
      for (const e of lista) {
        if (e.tipo === "ingreso") {
          if (abierto) avisos.push({ fila: abierto.n, grave: true, texto: `Ingreso sin salida antes de otro ingreso del mismo equipo (fila ${e.n}); se omite.` });
          abierto = e;
        } else if (!abierto) {
          avisos.push({ fila: e.n, grave: true, texto: "Salida sin ingreso previo; se omite." });
        } else {
          cerradas.push(armar(abierto, e.fecha, [abierto.n, e.n]));
          abierto = null;
        }
      }
      if (abierto) abiertas.push(armar(abierto, null, [abierto.n]));
    }
  }

  // Una sola falla abierta por equipo (la más reciente)
  abiertas.sort((a, b) => Date.parse(b.fecha_ingreso) - Date.parse(a.fecha_ingreso));
  const vistos = new Set<string>();
  const abiertasUnicas = abiertas.filter((o) => {
    if (vistos.has(o.id_equipo)) { avisos.push({ fila: o.filas[0], grave: true, texto: "El equipo ya tiene una falla abierta más reciente; se omite." }); return false; }
    vistos.add(o.id_equipo); return true;
  });

  const porFecha = (a: OrdenImport, b: OrdenImport) => Date.parse(a.fecha_ingreso) - Date.parse(b.fecha_ingreso);
  avisos.sort((a, b) => a.fila - b.fila);
  return {
    modo, ordenFecha, avisos,
    cerradas: cerradas.sort(porFecha),
    abiertas: abiertasUnicas.sort(porFecha),
    causasSinCatalogo: [...causasSin.entries()].sort((a, b) => b[1] - a[1]),
  };
}
