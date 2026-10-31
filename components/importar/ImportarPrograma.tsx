"use client";

// Importador único del programa de mantenimiento, en tres pasos: subir, revisar y confirmar.
// Acepta la plantilla Factory, el programa anual CABLOMTO-F01 (se traduce solo) o cualquier tabla propia,
// cuyas columnas se unen a las de Factory una vez y quedan guardadas para la empresa.
import { useEffect, useMemo, useState, useTransition } from "react";
import { leerArchivoTabla } from "@/lib/tabla";
import {
  armarCarga, CATEGORIAS, enteroFicha, leerPlanAnual, normalizar, OMITIR, proximaProgramada, resumenFechas, sugerirAlmacen,
  type AjustesFicha, type Carga, type Categoria, type Lectura, type Problema,
} from "@/lib/planAnual";
import {
  ALMACENES_ELEGIDOS, CAMPOS, faltantes, filaEncabezados, firmaEncabezados, leerPlantilla, mapeoAutomatico, mapeoParaGuardar, plantillaXlsx,
  type Campo, type Mapeo, type MapeosGuardados,
} from "@/lib/plantillaFactory";
import type { Simulacion } from "@/app/(app)/p/[pilar]/planes/acciones";
import { guardarFichaAlmacen } from "@/app/(app)/(general)/configuracion/acciones";
import { Barra } from "@/components/ui";

type Almacen = { id: string; nombre: string };
type Respuesta = { ok: boolean; mensaje: string };
type Fuente = { archivo: string } & ({ tipo: "cablomto"; lectura: Lectura } | { tipo: "tabla"; tabla: string[][]; fila: number });

const HOJA_PREFERIDA = "CABLOMTO-F01-I41";
const PASOS = ["Subir archivo", "Revisar", "Confirmar"] as const;
const n = (v: number) => v.toLocaleString("es-MX");
const hoyMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const mesCorto = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });

// Cómo se pinta cada aviso según su nivel; el prefijo dice lo mismo que el color para quien no lo distingue
const NIVEL: Record<Problema["nivel"], { orden: number; clase: string; prefijo: string }> = {
  error: { orden: 0, clase: "bg-paro-suave text-paro-texto", prefijo: "Error" },
  aviso: { orden: 1, clase: "bg-alerta-suave text-alerta-texto", prefijo: "Revisar" },
  info: { orden: 2, clase: "bg-papel text-tinta", prefijo: "Nota" },
};

/** Valor de un campo numérico de la ficha: vacío = sin ajuste; lo demás se guarda tal cual para que armarCarga lo valide. */
const leerCampo = (v: string) => (v.trim() === "" ? undefined : Number(v));

/** Primero el formato CABLOMTO en cualquiera de sus hojas; si no, la primera hoja como tabla con encabezados. */
async function leer(archivo: File): Promise<Fuente | "sin-encabezados" | null> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    for (const h of [HOJA_PREFERIDA, 1, 2, 3, 4, 5, 6, 7, 8]) {
      try {
        const l = leerPlanAnual(await readSheet(archivo, h) as never, String(h));
        if (l) return { archivo: archivo.name, tipo: "cablomto", lectura: l };
      } catch { /* hoja inexistente: se prueba la siguiente */ }
    }
  }
  const tabla = await leerArchivoTabla(archivo);
  if (!tabla) return null;
  const fila = filaEncabezados(tabla);
  return fila < 0 ? "sin-encabezados" : { archivo: archivo.name, tipo: "tabla", tabla, fila };
}

export function ImportarPrograma({ pilar, almacenes, mapeos, cargar, simular, recordar: recordarEnEmpresa }: {
  pilar: string;
  almacenes: Almacen[];
  mapeos: MapeosGuardados;
  cargar: (pilar: string, carga: Carga) => Promise<Respuesta>;
  simular: (pilar: string, carga: Carga) => Promise<Respuesta & { simulacion?: Simulacion }>;
  recordar: (firma: string | null, mapeo: Partial<Record<Campo, string>> | null, almacenes: Record<string, string>) => Promise<Respuesta>;
}) {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [fuente, setFuente] = useState<Fuente | null>(null);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [filtroAlm, setFiltroAlm] = useState("");
  const [filtroCat, setFiltroCat] = useState<Categoria | "">("");
  const [todosPlanes, setTodosPlanes] = useState(false);
  const [resultado, setResultado] = useState<Respuesta | null>(null);
  const [sim, setSim] = useState<{ carga: Carga; r: Respuesta & { simulacion?: Simulacion } } | null>(null);
  const [todosCambios, setTodosCambios] = useState(false);
  const [ajustes, setAjustes] = useState<AjustesFicha>({});
  const [guardando, iniciar] = useTransition();
  const hoy = useMemo(hoyMx, []);

  const encabezados = fuente?.tipo === "tabla" ? fuente.tabla[fuente.fila] : [];
  const firma = firmaEncabezados(encabezados);
  const conGuardado = fuente?.tipo === "tabla" && !!mapeos[firma];
  const lectura = useMemo(() => (!fuente ? null : fuente.tipo === "cablomto" ? fuente.lectura : leerPlantilla(fuente.tabla, fuente.fila, mapeo, "1")), [fuente, mapeo]);
  const sinColumna = fuente?.tipo === "tabla" ? faltantes(mapeo) : [];

  // Almacén de Factory de cada almacén del archivo: lo que eligió la persona, lo que eligió la vez pasada o la sugerencia
  const empates = useMemo(() => {
    const antes = mapeos[ALMACENES_ELEGIDOS] ?? {};
    const vigente = (id: string | undefined) => (id === OMITIR || almacenes.some((a) => a.id === id) ? id : undefined);
    return Object.fromEntries((lectura?.fichas ?? []).map((f) =>
      [f.almacen, elegidos[f.almacen] ?? vigente(antes[normalizar(f.almacen)]) ?? sugerirAlmacen(f.almacen, almacenes).id ?? ""]));
  }, [lectura, elegidos, almacenes, mapeos]);
  const sinEmpatar = lectura ? lectura.fichas.filter((f) => !empates[f.almacen]).length : 0;
  const categorias = useMemo(() => {
    const m = new Map<Categoria, number>();
    lectura?.activos.forEach((a) => m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [lectura]);
  const filtrados = useMemo(() => (lectura?.activos ?? []).filter((a) => (!filtroAlm || a.almacen === filtroAlm) && (!filtroCat || a.categoria === filtroCat)), [lectura, filtroAlm, filtroCat]);
  const nombreAlm = (id: string) => almacenes.find((a) => a.id === id)?.nombre;
  const preparado = useMemo(() => (lectura && !sinEmpatar ? armarCarga(lectura, empates, hoy, fuente?.archivo ?? "", pilar, ajustes) : null),
    [lectura, empates, sinEmpatar, hoy, fuente, pilar, ajustes]);
  const fechas = useMemo(() => (preparado ? resumenFechas(preparado.carga) : null), [preparado]);
  const problemas = useMemo(() => [...(lectura?.problemas ?? [])].sort((a, b) => NIVEL[a.nivel].orden - NIVEL[b.nivel].orden), [lectura]);
  // Almacenes del archivo a los que les falta un dato de la nave, para resaltarlos en la tabla
  const faltaFicha = useMemo(() => {
    const de = (t: Problema["tipo"]) => new Set(problemas.find((p) => p.tipo === t)?.almacenes ?? []);
    return { andenes: de("sin-andenes"), pasillos: de("sin-pasillos") };
  }, [problemas]);
  // Lo capturado a mano en almacenes que sí se cargan; se guarda también como ficha manual al confirmar
  const ajustados = useMemo(() => Object.entries(ajustes).flatMap(([alm, a]) => {
    const id = empates[alm], ficha = { ...(enteroFicha(a.andenes) ? { andenes: a.andenes } : {}), ...(enteroFicha(a.pasillos) ? { pasillos: a.pasillos } : {}) };
    return id && id !== OMITIR && Object.keys(ficha).length ? [{ alm, id, ficha }] : [];
  }), [ajustes, empates]);
  // Solo el programa de inmueble describe la nave (andenes, pasillos); en los demás no se pide la ficha.
  const conNave = !!lectura?.fichas.some((f) => f.andenes || f.pasillos) || faltaFicha.andenes.size + faltaFicha.pasillos.size > 0;
  const conCodigos = !!lectura?.planes.some((p) => p.codigos.length);
  const conHoras = !!lectura?.activos.some((a) => a.horas !== null);

  // Al llegar a Confirmar se simula la carga en la base (se corre y se deshace) para decir exactamente qué va a pasar
  const carga = paso === 3 ? preparado?.carga : undefined;
  useEffect(() => {
    if (!carga || sim?.carga === carga) return;
    let vigente = true;
    simular(pilar, carga)
      .catch(() => ({ ok: false, mensaje: "No se pudo simular la carga. Revisa tu conexión." }))
      .then((r) => { if (vigente) setSim({ carga, r }); });
    return () => { vigente = false; };
  }, [carga, sim, simular, pilar]);
  const simulacion = sim && sim.carga === carga ? sim.r : null;

  function reiniciar() {
    setPaso(1); setFuente(null); setMapeo({}); setElegidos({}); setAjustes({}); setError(null); setResultado(null); setFiltroAlm(""); setFiltroCat("");
  }

  async function alElegir(archivo: File | undefined) {
    reiniciar();
    if (!archivo) return;
    if (!/\.(xlsx|csv|txt|tsv)$/i.test(archivo.name)) { setError("Sube un archivo .xlsx o .csv. Si es un .xls viejo, guárdalo como .xlsx."); return; }
    setLeyendo(true);
    try {
      const f = await leer(archivo);
      if (!f) setError("No se pudo leer el archivo. Revisa que no esté protegido con contraseña.");
      else if (f === "sin-encabezados") setError("No se encontró una fila de títulos (Almacén, Denominación, Frecuencia…). Usa la plantilla Factory o agrega los títulos a tu Excel.");
      else {
        if (f.tipo === "tabla") { const enc = f.tabla[f.fila]; setMapeo(mapeoAutomatico(enc, mapeos[firmaEncabezados(enc)] as Partial<Record<Campo, string>> | undefined)); }
        setFuente(f); setPaso(2);
      }
    } catch {
      setError("No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  }

  function descargarPlantilla() {
    const url = URL.createObjectURL(plantillaXlsx(pilar, almacenes.map((a) => a.nombre)));
    const a = document.createElement("a");
    a.href = url; a.download = `plantilla-programa-${pilar}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  function cargarAhora() {
    if (!preparado) return;
    setResultado(null);
    iniciar(async () => {
      const r = await cargar(pilar, preparado.carga);
      // lo capturado a mano queda como ficha manual: el siguiente programa ya no lo pisa
      if (r.ok && ajustados.length) {
        const fallas: string[] = [];
        for (const a of ajustados) {
          const g = await guardarFichaAlmacen(a.id, a.ficha).catch(() => ({ ok: false, mensaje: "sin conexión" }));
          if (!g.ok) fallas.push(`${a.alm}: ${g.mensaje}`);
        }
        if (fallas.length) r.mensaje += ` No se guardó la ficha manual de ${fallas.join("; ")}.`;
      }
      setResultado(r);
      // lo decidido (columnas y almacenes) queda guardado para la próxima vez
      if (r.ok && recordar) {
        const tabla = fuente?.tipo === "tabla";
        await recordarEnEmpresa(tabla ? firma : null, tabla ? mapeoParaGuardar(encabezados, mapeo) : null,
          Object.fromEntries(Object.entries(empates).filter(([, v]) => v).map(([k, v]) => [normalizar(k), v])));
      }
    });
  }

  return (
    <details className="caja-panel group mb-6 overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
        <span>
          <span className="block text-[17px] font-semibold">Importar programa de mantenimiento</span>
          <span className="block text-[14px] text-suave">Activos, planes y fechas desde Excel: con la plantilla Factory o con tu propio formato.</span>
        </span>
        <span aria-hidden="true" className="text-suave transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="space-y-6 border-t border-papel px-6 py-5">
        <ol aria-label="Pasos de la importación" className="flex flex-wrap gap-2 text-[14px]">
          {PASOS.map((t, i) => {
            const k = (i + 1) as 1 | 2 | 3, actual = paso === k, hecho = paso > k;
            return (
              <li key={t}>
                <button type="button" disabled={!hecho || guardando} onClick={() => setPaso(k)} aria-current={actual ? "step" : undefined}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 ${actual ? "bg-tinta font-medium text-sobre-tinta" : hecho ? "cursor-pointer bg-papel text-tinta hover:bg-panel-2" : "bg-papel text-suave"}`}>
                  <span className="tabular-nums">{hecho ? "✓" : k}</span> {t}
                </button>
              </li>
            );
          })}
        </ol>

        {paso === 1 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] bg-papel p-4">
                <p className="font-semibold">Plantilla Factory</p>
                <p className="mt-1 text-[14px] text-suave">Una fila por activo y frecuencia, con tus almacenes y las frecuencias en listas para elegir. Es el formato recomendado.</p>
                <button type="button" onClick={descargarPlantilla} className="btn-sec mt-3 min-h-10 px-4 text-[14px]">Descargar plantilla</button>
              </div>
              <div className="rounded-[18px] bg-papel p-4">
                <p className="font-semibold">Tu propio formato</p>
                <p className="mt-1 text-[14px] text-suave">El programa anual CABLOMTO-F01 se lee tal cual. Cualquier otra tabla la unes a las columnas de Factory una vez y queda guardada para los siguientes archivos.</p>
              </div>
            </div>
            <label className="block">
              <span className="etiqueta">Archivo .xlsx o .csv</span>
              <input type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => alElegir(e.target.files?.[0])} aria-describedby="importar-estado"
                className="campo cursor-pointer file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-papel file:px-4 file:py-1.5 file:text-[14px] file:font-medium" />
            </label>
            <p id="importar-estado" aria-live="polite" className="text-[14px]">
              {leyendo && <span className="text-suave">Leyendo el archivo…</span>}
              {error && <span role="alert" className="text-paro-texto">{error}</span>}
            </p>
          </>
        )}

        {paso === 2 && fuente && (
          <>
            <p className="text-[15px]">
              <strong className="font-semibold">{fuente.archivo}</strong>
              <span className="text-suave"> · {fuente.tipo === "cablomto" ? "programa anual CABLOMTO-F01" : conGuardado ? "formato conocido: se usaron las columnas guardadas" : "tabla con columnas"} · nada se guarda hasta confirmar.</span>
            </p>

            {fuente.tipo === "tabla" && (
              <section aria-labelledby="imp-columnas">
                <h3 id="imp-columnas" className="mb-1 text-[17px] font-semibold">Columnas</h3>
                <p className="mb-3 text-[14px] text-suave">De qué columna de tu archivo sale cada dato. Factory unió las que reconoció; revisa y completa las demás.</p>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CAMPOS.map((c) => {
                    const req = "requerido" in c && c.requerido, falta = req && mapeo[c.clave] === undefined;
                    return (
                      <label key={c.clave} className="block">
                        <span className="mb-1 block text-[14px] font-medium">{c.etiqueta}{req ? <span className="font-normal text-suave"> · obligatoria</span> : ""}</span>
                        <select value={mapeo[c.clave] ?? ""} aria-invalid={falta || undefined} aria-label={`Columna del archivo para ${c.etiqueta}`}
                          onChange={(e) => setMapeo((m) => ({ ...m, [c.clave]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                          className={`selector min-h-10 w-full rounded-full py-0 pl-3.5 text-[14px] ${falta ? "bg-paro-suave text-paro-texto" : mapeo[c.clave] === undefined ? "bg-panel-2 text-suave" : "bg-papel"}`}>
                          <option value="">— No viene en el archivo —</option>
                          {encabezados.map((h, i) => String(h).trim() && <option key={i} value={i}>{String(h).trim()}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
                {sinColumna.length > 0 && (
                  <p role="alert" className="mt-3 rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">
                    Elige la columna de {sinColumna.map((c) => c.etiqueta).join(", ")} para ver la vista previa.
                  </p>
                )}
              </section>
            )}

            {fuente.tipo === "tabla" && !sinColumna.length && !lectura && (
              <p role="alert" className="rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">Con esas columnas no sale ningún activo: revisa que Almacén y Denominación apunten a las columnas correctas.</p>
            )}

            {lectura && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Activos", n(lectura.activos.length)],
                    ["Almacenes", `${lectura.fichas.length}${sinEmpatar ? ` · ${sinEmpatar} sin elegir` : ""}`],
                    ["Planes", n(lectura.planes.length)],
                    ["Avisos", n(lectura.problemas.length)],
                  ].map(([t, v]) => (
                    <div key={t} className="rounded-[18px] bg-papel px-4 py-3">
                      <dt className="text-[13px] text-suave">{t}</dt>
                      <dd className="text-[22px] font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>

                {problemas.length > 0 && (
                  <section aria-labelledby="imp-avisos">
                    <h3 id="imp-avisos" className="mb-2 text-[17px] font-semibold">Avisos</h3>
                    <ul className="space-y-2">
                      {problemas.map((p) => {
                        const nv = NIVEL[p.nivel];
                        return (
                          <li key={p.tipo} className={`rounded-[14px] px-4 py-3 text-[14px] ${nv.clase}`}>
                            <p><strong className="font-semibold">{nv.prefijo}:</strong> {p.texto}</p>
                            {!!p.filas?.length && (
                              <details className="group/filas mt-2">
                                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 font-medium underline-offset-2 hover:underline">
                                  <span aria-hidden="true" className="transition-transform group-open/filas:rotate-90">›</span>
                                  Ver {p.filas.length === 1 ? "la fila" : `las ${n(p.filas.length)} filas`}
                                </summary>
                                <ul className="mt-1 max-h-80 divide-y divide-papel overflow-y-auto rounded-[12px] bg-panel text-tinta">
                                  {p.filas.map((f, i) => (
                                    <li key={`${f.fila}-${i}`} className="grid gap-x-3 px-3 py-2 sm:grid-cols-[4.5rem_6rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline">
                                      <span className="text-[13px] text-suave sm:text-[14px]"><span className="tabular-nums">Fila {f.fila}</span><span className="sm:hidden"> · <span className="font-mono">{f.almacen}</span></span></span>
                                      <span className="hidden font-mono sm:block">{f.almacen}</span>
                                      <span className="break-words">{f.denominacion}</span>
                                      <span className="break-words text-suave">{f.detalle}</span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section aria-labelledby="imp-almacenes">
                  <h3 id="imp-almacenes" className="mb-1 text-[17px] font-semibold">{conNave ? "Almacenes y su ficha" : "Almacenes"}</h3>
                  <p className="mb-3 text-[14px] text-suave">{conNave
                    ? "Andenes y pasillos salen de las denominaciones (“Andén CDNQ 12”, “racks pasillo 05”) y arman la nave en 3D. Si faltan o no cuadran, escríbelos: lo capturado aquí queda como ficha manual y el programa ya no lo cambia."
                    : "Elige a qué almacén de Factory corresponde cada uno del archivo."}</p>
                  {preparado && preparado.ajustesIgnorados.length > 0 && (
                    <p role="alert" className="mb-3 rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">
                      No se usan estos valores (deben ser enteros de 0 a 500): {preparado.ajustesIgnorados.join(", ")}.
                    </p>
                  )}
                  {sinEmpatar > 1 && (
                    <p className="mb-3 flex flex-wrap items-center gap-3 rounded-[14px] bg-papel px-4 py-3 text-[14px]">
                      <span>{sinEmpatar} almacenes del archivo no existen en Factory (o tienen varias opciones).</span>
                      <button type="button" className="btn-sec min-h-9 px-4 text-[14px]"
                        onClick={() => setElegidos((x) => ({ ...x, ...Object.fromEntries(lectura.fichas.filter((f) => !empates[f.almacen]).map((f) => [f.almacen, OMITIR])) }))}>
                        No cargar los {sinEmpatar} sin elegir
                      </button>
                    </p>
                  )}
                  <div className="relative overflow-x-auto">
                    <table className={`w-full text-[14px] ${conNave ? "min-w-[860px]" : "min-w-[520px]"}`}>
                      <thead className="text-left text-[13px] text-suave">
                        <tr>{["Archivo", "Almacén en Factory", "Activos", ...(conNave ? ["Andenes", "Pasillos", "Zonas", "Louvers · extractores · inyectores"] : [])].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {lectura.fichas.map((f) => {
                          const sug = sugerirAlmacen(f.almacen, almacenes);
                          return (
                            <tr key={f.almacen} className="border-t border-papel align-middle">
                              <td className="px-3 py-2 font-mono font-semibold">{f.almacen}</td>
                              <td className="px-3 py-2">
                                <label className="sr-only" htmlFor={`imp-alm-${f.almacen}`}>Almacén de Factory para {f.almacen}</label>
                                <select id={`imp-alm-${f.almacen}`} value={empates[f.almacen] ?? ""} onChange={(e) => setElegidos((x) => ({ ...x, [f.almacen]: e.target.value }))}
                                  className={`selector min-h-9 w-full rounded-full py-0 pl-3.5 text-[14px] ${!empates[f.almacen] ? "bg-paro-suave text-paro-texto" : empates[f.almacen] === OMITIR ? "bg-panel-2 text-suave" : "bg-papel"}`}>
                                  <option value="">{sug.opciones.length ? "Elige…" : "Sin empatar"}</option>
                                  <option value={OMITIR}>No cargar este almacén</option>
                                  {[...sug.opciones.map((id) => almacenes.find((a) => a.id === id)!).filter(Boolean),
                                    ...almacenes.filter((a) => !sug.opciones.includes(a.id))].map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 tabular-nums">{n(f.activos)}</td>
                              {conNave && <>
                                {(["andenes", "pasillos"] as const).map((k) => {
                                  const propio = ajustes[f.almacen]?.[k], leido = f[k], valor = propio ?? (leido || undefined);
                                  const malo = propio !== undefined && !enteroFicha(propio), falta = valor === undefined && faltaFicha[k].has(f.almacen);
                                  return (
                                    <td key={k} className="px-3 py-2">
                                      <label className="sr-only" htmlFor={`imp-${k}-${f.almacen}`}>{k === "andenes" ? "Andenes" : "Pasillos"} de {f.almacen}</label>
                                      <input id={`imp-${k}-${f.almacen}`} type="number" inputMode="numeric" min={0} max={500} step={1}
                                        value={valor ?? ""} placeholder={falta ? "falta" : "—"} aria-invalid={malo || falta || undefined}
                                        onChange={(e) => setAjustes((x) => {
                                          const v = leerCampo(e.target.value), resto = { ...x[f.almacen] };
                                          // escribir lo mismo que trae el archivo no cuenta como ajuste manual
                                          if (v === undefined || v === leido) delete resto[k]; else resto[k] = v;
                                          const otros = { ...x };
                                          if (Object.keys(resto).length) otros[f.almacen] = resto; else delete otros[f.almacen];
                                          return otros;
                                        })}
                                        className={`min-h-10 w-20 rounded-[10px] px-2.5 tabular-nums placeholder:text-current placeholder:opacity-70 ${malo || falta ? "bg-paro-suave text-paro-texto" : propio !== undefined ? "bg-info-suave text-info-texto" : "bg-papel"}`} />
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2 text-suave">{f.zonas.map((z) => CATEGORIAS[z]).join(", ") || "—"}</td>
                                <td className="px-3 py-2 tabular-nums text-suave">{f.techo.louvers} · {f.techo.extractores} · {f.techo.inyectores}</td>
                              </>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {conNave && (
                    <p className="mt-2 text-[13px] text-suave">
                      {ajustados.length
                        ? `${ajustados.length === 1 ? "1 almacén lleva" : `${ajustados.length} almacenes llevan`} andenes o pasillos capturados a mano (en azul).`
                        : "En rojo, lo que falta; en azul, lo que captures a mano."}
                    </p>
                  )}
                </section>

                <section aria-labelledby="imp-planes">
                  <h3 id="imp-planes" className="mb-1 text-[17px] font-semibold">Planes</h3>
                  <p className="mb-3 text-[14px] text-suave">{fuente.tipo === "cablomto"
                    ? "Uno por categoría y frecuencia; se conservan los códigos de plan de SAP como referencia."
                    : "Los que diga la columna Servicio; si va vacía, uno por categoría y frecuencia. Los que ya existan en Factory se reutilizan."}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[14px]">
                      <thead className="text-left text-[13px] text-suave">
                        <tr>{["Plan", "Cada", "Activos", ...(conCodigos ? ["Códigos SAP"] : [])].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {(todosPlanes ? lectura.planes : lectura.planes.slice(0, 12)).map((p) => (
                          <tr key={p.nombre} className="border-t border-papel">
                            <td className="px-3 py-2 font-medium">{p.nombre}</td>
                            <td className="px-3 py-2 tabular-nums">{p.cada_dias} días</td>
                            <td className="px-3 py-2 tabular-nums">{n(p.activos)}</td>
                            {conCodigos && <td className="px-3 py-2 font-mono text-[13px] text-suave">{p.codigos.slice(0, 6).join(", ")}{p.codigos.length > 6 ? ` +${p.codigos.length - 6}` : ""}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lectura.planes.length > 12 && (
                    <button type="button" onClick={() => setTodosPlanes((v) => !v)} className="enlace mt-2 cursor-pointer text-[14px]">
                      {todosPlanes ? "Ver menos" : `Ver los ${lectura.planes.length} planes`}
                    </button>
                  )}
                </section>

                <section aria-labelledby="imp-activos">
                  <h3 id="imp-activos" className="mb-3 text-[17px] font-semibold">Activos</h3>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {categorias.map(([c, k]) => (
                      <button key={c} type="button" onClick={() => setFiltroCat((x) => (x === c ? "" : c))} aria-pressed={filtroCat === c}
                        className={`chip min-h-9 cursor-pointer ${filtroCat === c ? "bg-tinta text-sobre-tinta" : "bg-papel text-tinta hover:bg-panel-2"}`}>
                        {CATEGORIAS[c]} <span className="tabular-nums opacity-70">{n(k)}</span>
                      </button>
                    ))}
                  </div>
                  <label className="mb-3 inline-flex items-center gap-2 text-[14px]">
                    <span className="text-suave">Almacén</span>
                    <select value={filtroAlm} onChange={(e) => setFiltroAlm(e.target.value)} className="selector min-h-9 w-auto rounded-full bg-papel py-0 pl-3.5 text-[14px]">
                      <option value="">Todos</option>
                      {lectura.fichas.map((f) => <option key={f.almacen} value={f.almacen}>{f.almacen}{empates[f.almacen] && empates[f.almacen] !== OMITIR ? ` · ${nombreAlm(empates[f.almacen])}` : ""}</option>)}
                    </select>
                  </label>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[14px]">
                      <thead className="text-left text-[13px] text-suave">
                        <tr>{["Fila", "Almacén", "SAP", "Denominación", "Categoría", "Frecuencia", "Próximo programado", ...(conHoras ? ["Horas por servicio"] : [])].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {filtrados.slice(0, 60).map((a) => (
                          <tr key={a.fila} className="border-t border-papel">
                            <td className="px-3 py-1.5 tabular-nums text-suave">{a.fila}</td>
                            <td className="px-3 py-1.5 font-mono">{a.almacen}</td>
                            <td className="px-3 py-1.5 tabular-nums">{a.sinSap ? <span className="chip bg-alerta-suave text-alerta-texto">{a.clave || "sin SAP"}</span> : a.sap}</td>
                            <td className="px-3 py-1.5">{a.denominacion}</td>
                            <td className="px-3 py-1.5">{CATEGORIAS[a.categoria]}</td>
                            <td className="px-3 py-1.5">{a.frecuencias.join(" · ") || <span className="text-paro-texto">sin plan</span>}</td>
                            <td className="px-3 py-1.5 tabular-nums">{(() => { const p = proximaProgramada(a, hoy); return p ? fechaCorta(p) : <span className="text-suave">—</span>; })()}</td>
                            {conHoras && <td className="px-3 py-1.5 tabular-nums">{a.horas ?? "—"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[13px] text-suave">{filtrados.length > 60 ? `Mostrando 60 de ${n(filtrados.length)}.` : `${n(filtrados.length)} activos.`}</p>
                </section>
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-papel pt-4">
              <button type="button" onClick={reiniciar} className="btn-sec min-h-11">Subir otro archivo</button>
              <div className="flex flex-wrap items-center gap-3">
                {lectura && sinEmpatar > 0 && (
                  <p className="text-[14px] text-suave">Elige el almacén de Factory para {sinEmpatar === 1 ? "el almacén marcado en rojo" : `los ${sinEmpatar} almacenes marcados en rojo`}.</p>
                )}
                <button type="button" onClick={() => setPaso(3)} disabled={!preparado} className="btn-primario min-h-11 disabled:cursor-not-allowed disabled:opacity-50">Continuar</button>
              </div>
            </div>
          </>
        )}

        {paso === 3 && preparado && fuente && (
          <div className="space-y-4" aria-live="polite">
            {resultado ? (
              <>
                <p role={resultado.ok ? "status" : "alert"}
                  className={`rounded-[14px] px-4 py-3 text-[15px] ${resultado.ok ? "bg-ok-suave text-ok-texto" : "bg-paro-suave text-paro-texto"}`}>{resultado.mensaje}</p>
                <div className="flex flex-wrap gap-2">
                  {resultado.ok
                    ? <button type="button" onClick={reiniciar} className="btn-sec min-h-11">Importar otro archivo</button>
                    : <button type="button" onClick={cargarAhora} disabled={guardando} className="btn-primario min-h-11">{guardando ? "Cargando…" : "Reintentar"}</button>}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-[15px]">
                  <strong className="font-semibold">¿Cargar {fuente.archivo} a Factory?</strong>
                  <span className="text-suave"> Factory hizo la carga de prueba y la deshizo: esto es lo que va a pasar. Todavía no se guardó nada.</span>
                </p>

                {fechas && (
                  <section aria-labelledby="imp-fechas" className="rounded-[18px] bg-papel p-4">
                    <h3 id="imp-fechas" className="text-[17px] font-semibold">Fechas del programa</h3>
                    {fechas.total === 0 ? (
                      <p className="mt-1 text-[14px] text-suave">El archivo no trae fechas programadas: los servicios se calculan desde hoy con su frecuencia.</p>
                    ) : (() => {
                      const meses = Object.entries(fechas.porMes), tope = Math.max(...meses.map(([, v]) => v));
                      const porAlm = Object.entries(fechas.porAlmacen).sort((a, b) => b[1] - a[1]);
                      return (
                        <>
                          <p className="mt-1 text-[14px] text-suave">
                            <strong className="font-semibold text-tinta tabular-nums">{n(fechas.total)}</strong> fechas
                            {fechas.desde && fechas.hasta && <> del {fechaCorta(fechas.desde)} al {fechaCorta(fechas.hasta)}</>}
                            {" "}· <strong className="font-semibold text-tinta tabular-nums">{n(fechas.semana1)}</strong> en la semana 1 del año.
                          </p>
                          <div className="mt-4 grid gap-6 lg:grid-cols-2">
                            <div>
                              <h4 className="mb-2 text-[14px] font-medium">Por mes</h4>
                              <ul className="space-y-1.5">
                                {meses.map(([m, v]) => (
                                  <li key={m} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[13px]">
                                    <span className="text-suave">{mesCorto(m)}</span>
                                    <Barra valor={(v / tope) * 100} tono="tinta" />
                                    <span className="text-right tabular-nums">{n(v)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="mb-2 text-[14px] font-medium">Por almacén</h4>
                              <ul className="max-h-80 divide-y divide-panel-2 overflow-y-auto pr-3 text-[14px]">
                                {porAlm.map(([id, v]) => (
                                  <li key={id} className="flex items-baseline justify-between gap-3 py-1.5">
                                    <span className="min-w-0 truncate">{nombreAlm(id) ?? "—"}</span>
                                    <span className="tabular-nums">{n(v)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </section>
                )}

                {!simulacion ? (
                  <p role="status" aria-busy="true" className="rounded-[14px] bg-papel px-4 py-3 text-[14px] text-suave">Simulando la carga de {n(preparado.carga.activos.length)} activos…</p>
                ) : !simulacion.ok || !simulacion.simulacion ? (
                  <p role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">
                    <span>{simulacion.mensaje}</span>
                    <button type="button" onClick={() => setSim(null)} className="btn-sec min-h-9 px-4 text-[14px]">Volver a simular</button>
                  </p>
                ) : (() => {
                  const s = simulacion.simulacion, fuera = s.existentes_antes - s.equipos_actualizados, iguales = s.equipos_actualizados - s.cambios_total;
                  const cambio = (antes: string | null, ahora: string | null) => antes === ahora
                    ? <span className="text-suave">{ahora ?? "—"}</span>
                    : <><span className="text-suave line-through decoration-1">{antes ?? "sin dato"}</span> <span aria-hidden="true">→</span><span className="sr-only">cambia a</span> <span className="font-medium">{ahora ?? "sin dato"}</span></>;
                  return (
                    <>
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {([
                          ["Equipos nuevos", s.equipos_nuevos],
                          ["Equipos que cambian", s.cambios_total],
                          ["Planes nuevos", s.planes_nuevos],
                          ["Asignaciones nuevas", s.asignaciones_nuevas],
                          ...(typeof s.programadas_nuevas === "number" ? [["Fechas nuevas", s.programadas_nuevas]] : []),
                        ] as [string, number][]).map(([t, v]) => (
                          <div key={t} className="rounded-[18px] bg-papel px-4 py-3">
                            <dt className="text-[13px] text-suave">{t}</dt>
                            <dd className="text-[22px] font-semibold tabular-nums">{n(v as number)}</dd>
                          </div>
                        ))}
                      </dl>

                      <ul className="list-disc space-y-1 pl-5 text-[14px]">
                        {iguales > 0 && <li>{n(iguales)} {iguales === 1 ? "equipo ya está" : "equipos ya están"} en Factory igual que en el archivo: no cambian.</li>}
                        {fuera > 0 && <li>{n(fuera)} {fuera === 1 ? "equipo que ya está" : "equipos que ya están"} en Factory no {fuera === 1 ? "viene" : "vienen"} en el archivo: se {fuera === 1 ? "queda" : "quedan"} como {fuera === 1 ? "está" : "están"}.</li>}
                        {s.sap_en_otro_pilar > 0 && <li>{n(s.sap_en_otro_pilar)} {s.sap_en_otro_pilar === 1 ? "activo trae un SAP que ya usa otro pilar: se carga" : "activos traen un SAP que ya usa otro pilar: se cargan"} sin SAP.</li>}
                        {preparado.sapQuitados > 0 && <li>{preparado.sapQuitados === 1 ? "1 activo con SAP repetido en el archivo se carga" : `${n(preparado.sapQuitados)} activos con SAP repetido en el archivo se cargan`} sin SAP.</li>}
                        {preparado.clavesQuitadas > 0 && <li>{preparado.clavesQuitadas === 1 ? "1 activo con clave repetida en el archivo se carga" : `${n(preparado.clavesQuitadas)} activos con clave repetida en el archivo se cargan`} sin clave.</li>}
                        {preparado.sinAlmacen > 0 && <li>{n(preparado.sinAlmacen)} activos de almacenes marcados “No cargar” se quedan fuera.</li>}
                        <li>{s.fichas ? `${n(s.fichas)} fichas de almacén (andenes, pasillos y zonas) se actualizan.` : "Las fichas de almacén no se tocan."}</li>
                        {ajustados.length > 0 && (
                          <li>Andenes o pasillos capturados a mano en {ajustados.length === 1 ? "1 almacén" : `${ajustados.length} almacenes`} ({ajustados.map((a) => a.alm).join(", ")}): se guardan como ficha manual y los siguientes programas no los cambian.</li>
                        )}
                        {s.programa && (
                          <li>
                            Programa del pilar después de cargar: {n(s.programa.total)} fechas
                            {s.programa.desde && s.programa.hasta ? `, del ${fechaCorta(s.programa.desde)} al ${fechaCorta(s.programa.hasta)}` : ""}.
                          </li>
                        )}
                        <li>
                          Agenda del pilar después de cargar:{" "}
                          <span className={s.agenda.vencidos ? "font-medium text-paro-texto" : ""}>{n(s.agenda.vencidos)} servicios vencidos</span>,
                          {" "}{n(s.agenda.proximos_30)} en los próximos 30 días y {n(s.agenda.despues)} más adelante.
                        </li>
                      </ul>

                      {s.cambios_total > 0 && (
                        <section aria-labelledby="imp-cambios">
                          <h3 id="imp-cambios" className="mb-1 text-[17px] font-semibold">Equipos que cambian</h3>
                          <p className="mb-3 text-[14px] text-suave">Ya existen en Factory (mismo SAP o clave) y toman los datos del archivo:
                            {" "}{n(s.cambios_por.nombre)} cambian de nombre, {n(s.cambios_por.categoria)} de categoría y {n(s.cambios_por.almacen)} de almacén.</p>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-[14px]">
                              <thead className="text-left text-[13px] text-suave">
                                <tr>{["SAP", "Nombre", "Categoría", "Almacén"].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {(todosCambios ? s.cambios : s.cambios.slice(0, 15)).map((c, i) => (
                                  <tr key={`${c.sap ?? c.clave}-${i}`} className="border-t border-papel align-top">
                                    <td className="px-3 py-1.5 tabular-nums">{c.sap ?? c.clave ?? "—"}</td>
                                    <td className="px-3 py-1.5">{cambio(c.nombre_antes, c.nombre)}</td>
                                    <td className="px-3 py-1.5">{cambio(c.cat_antes && (CATEGORIAS[c.cat_antes as Categoria] ?? c.cat_antes), c.cat && (CATEGORIAS[c.cat as Categoria] ?? c.cat))}</td>
                                    <td className="px-3 py-1.5">{cambio(c.alm_antes, c.alm)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {s.cambios.length > 15 && (
                            <button type="button" onClick={() => setTodosCambios((v) => !v)} className="enlace mt-2 cursor-pointer text-[14px]">
                              {todosCambios ? "Ver menos" : `Ver ${s.cambios_total > s.cambios.length ? `los primeros ${n(s.cambios.length)} de ${n(s.cambios_total)}` : `los ${n(s.cambios_total)}`}`}
                            </button>
                          )}
                        </section>
                      )}
                    </>
                  );
                })()}

                <label className="flex items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-5 w-5" />
                  Recordar {fuente.tipo === "tabla" ? "las columnas y " : ""}los almacenes elegidos para la próxima importación
                </label>
                <div className="flex flex-wrap gap-2 border-t border-papel pt-4">
                  <button type="button" onClick={cargarAhora} disabled={guardando || !simulacion?.ok} aria-busy={guardando}
                    className="btn-primario min-h-11 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? "Cargando…" : "Sí, cargar"}</button>
                  <button type="button" onClick={() => setPaso(2)} disabled={guardando} className="btn-sec min-h-11">Volver a revisar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
