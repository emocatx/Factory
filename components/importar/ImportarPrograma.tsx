"use client";

// Importador único del programa de mantenimiento, en tres pasos: subir, revisar y confirmar.
// Acepta la plantilla Factory, el programa anual CABLOMTO-F01 (se traduce solo) o cualquier tabla propia,
// cuyas columnas se unen a las de Factory una vez y quedan guardadas para la empresa.
import { useEffect, useMemo, useState, useTransition } from "react";
import { leerArchivoTabla } from "@/lib/tabla";
import { armarCarga, CATEGORIAS, leerPlanAnual, normalizar, OMITIR, proximaProgramada, sugerirAlmacen, type Carga, type Categoria, type Lectura } from "@/lib/planAnual";
import {
  ALMACENES_ELEGIDOS, CAMPOS, faltantes, filaEncabezados, firmaEncabezados, leerPlantilla, mapeoAutomatico, mapeoParaGuardar, plantillaXlsx,
  type Campo, type Mapeo, type MapeosGuardados,
} from "@/lib/plantillaFactory";
import type { Simulacion } from "@/app/(app)/p/[pilar]/planes/acciones";

type Almacen = { id: string; nombre: string };
type Respuesta = { ok: boolean; mensaje: string };
type Fuente = { archivo: string } & ({ tipo: "cablomto"; lectura: Lectura } | { tipo: "tabla"; tabla: string[][]; fila: number });

const HOJA_PREFERIDA = "CABLOMTO-F01-I41";
const PASOS = ["Subir archivo", "Revisar", "Confirmar"] as const;
const n = (v: number) => v.toLocaleString("es-MX");
const hoyMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

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
  const preparado = useMemo(() => (lectura && !sinEmpatar ? armarCarga(lectura, empates, hoy, fuente?.archivo ?? "", pilar) : null), [lectura, empates, sinEmpatar, hoy, fuente, pilar]);
  // Solo el programa de inmueble describe la nave (andenes, pasillos); en los demás no se pide la ficha.
  const conNave = !!lectura?.fichas.some((f) => f.andenes || f.pasillos);
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
    setPaso(1); setFuente(null); setMapeo({}); setElegidos({}); setError(null); setResultado(null); setFiltroAlm(""); setFiltroCat("");
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

                {lectura.problemas.length > 0 && (
                  <section aria-labelledby="imp-avisos">
                    <h3 id="imp-avisos" className="mb-2 text-[17px] font-semibold">Avisos</h3>
                    <ul className="space-y-2">
                      {lectura.problemas.map((p) => (
                        <li key={p.tipo} className={`rounded-[14px] px-4 py-3 text-[14px] ${p.tipo === "sin-sap" ? "bg-alerta-suave text-alerta-texto" : "bg-paro-suave text-paro-texto"}`}>{p.texto}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section aria-labelledby="imp-almacenes">
                  <h3 id="imp-almacenes" className="mb-1 text-[17px] font-semibold">{conNave ? "Almacenes y su ficha" : "Almacenes"}</h3>
                  <p className="mb-3 text-[14px] text-suave">{conNave
                    ? "Andenes y pasillos salen de las denominaciones (“Andén CDNQ 12”, “racks pasillo 05”); arman la nave en 3D."
                    : "Elige a qué almacén de Factory corresponde cada uno del archivo."}</p>
                  {sinEmpatar > 1 && (
                    <p className="mb-3 flex flex-wrap items-center gap-3 rounded-[14px] bg-papel px-4 py-3 text-[14px]">
                      <span>{sinEmpatar} almacenes del archivo no existen en Factory (o tienen varias opciones).</span>
                      <button type="button" className="btn-sec min-h-9 px-4 text-[14px]"
                        onClick={() => setElegidos((x) => ({ ...x, ...Object.fromEntries(lectura.fichas.filter((f) => !empates[f.almacen]).map((f) => [f.almacen, OMITIR])) }))}>
                        No cargar los {sinEmpatar} sin elegir
                      </button>
                    </p>
                  )}
                  <div className="overflow-x-auto">
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
                                <td className={`px-3 py-2 tabular-nums ${f.andenes ? "" : "text-paro-texto"}`}>{f.andenes || "falta"}</td>
                                <td className={`px-3 py-2 tabular-nums ${f.pasillos ? "" : "text-paro-texto"}`}>{f.pasillos || "falta"}</td>
                                <td className="px-3 py-2 text-suave">{f.zonas.map((z) => CATEGORIAS[z]).join(", ") || "—"}</td>
                                <td className="px-3 py-2 tabular-nums text-suave">{f.techo.louvers} · {f.techo.extractores} · {f.techo.inyectores}</td>
                              </>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          ["Equipos nuevos", s.equipos_nuevos],
                          ["Equipos que cambian", s.cambios_total],
                          ["Planes nuevos", s.planes_nuevos],
                          ["Asignaciones nuevas", s.asignaciones_nuevas],
                        ].map(([t, v]) => (
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
