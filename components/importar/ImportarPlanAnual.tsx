"use client";

// Programa anual de mantenimiento (formato CABLOMTO-F01): lee el Excel en el navegador, muestra activos,
// categorías, planes propuestos, fichas de almacén y problemas, y al confirmar lo carga en una transacción.
import { useMemo, useState, useTransition } from "react";
import { armarCarga, CATEGORIAS, leerPlanAnual, OMITIR, proximaProgramada, sugerirAlmacen, type Carga, type Categoria, type Lectura } from "@/lib/planAnual";

type Almacen = { id: string; nombre: string };
type Respuesta = { ok: boolean; mensaje: string };
const HOJA_PREFERIDA = "CABLOMTO-F01-I41";
const n = (v: number) => v.toLocaleString("es-MX");
const hoyMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

async function leer(archivo: File): Promise<Lectura | null> {
  const { readSheet } = await import("read-excel-file/browser");
  // primero la hoja con el nombre del formato; si no existe, la primera hoja que se reconozca
  const hojas: (string | number)[] = [HOJA_PREFERIDA, 1, 2, 3, 4, 5, 6, 7, 8];
  for (const h of hojas) {
    try {
      const tabla = await readSheet(archivo, h);
      const l = leerPlanAnual(tabla as never, String(h));
      if (l) return l;
    } catch { /* hoja inexistente: se prueba la siguiente */ }
  }
  return null;
}

export function ImportarPlanAnual({ pilar, almacenes, cargar }: {
  pilar: string;
  almacenes: Almacen[];
  cargar: (pilar: string, carga: Carga) => Promise<Respuesta>;
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [empates, setEmpates] = useState<Record<string, string>>({});
  const [filtroAlm, setFiltroAlm] = useState("");
  const [filtroCat, setFiltroCat] = useState<Categoria | "">("");
  const [todosPlanes, setTodosPlanes] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState<Respuesta | null>(null);
  const [guardando, iniciar] = useTransition();
  const hoy = useMemo(hoyMx, []);

  async function alElegir(archivo: File | undefined) {
    setLectura(null); setError(null); setEmpates({}); setConfirmar(false); setResultado(null);
    if (!archivo) return;
    setArchivoNombre(archivo.name);
    if (!/\.xlsx$/i.test(archivo.name)) { setError("Sube el archivo .xlsx del programa anual."); return; }
    setCargando(true);
    try {
      const l = await leer(archivo);
      if (!l) { setError("No se reconoció el formato: se busca una hoja con las columnas ALMACÉN, N° y DENOMINACIÓN."); return; }
      setLectura(l);
      setEmpates(Object.fromEntries(l.fichas.map((f) => [f.almacen, sugerirAlmacen(f.almacen, almacenes).id ?? ""])));
    } catch {
      setError("No se pudo leer el archivo.");
    } finally {
      setCargando(false);
    }
  }

  const sinEmpatar = lectura ? lectura.fichas.filter((f) => !empates[f.almacen]).length : 0;
  const categorias = useMemo(() => {
    const m = new Map<Categoria, number>();
    lectura?.activos.forEach((a) => m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [lectura]);
  const filtrados = useMemo(() => (lectura?.activos ?? []).filter((a) => (!filtroAlm || a.almacen === filtroAlm) && (!filtroCat || a.categoria === filtroCat)), [lectura, filtroAlm, filtroCat]);
  const nombreAlm = (id: string) => almacenes.find((a) => a.id === id)?.nombre;
  // lo que se mandaría a la base con los almacenes elegidos
  const preparado = useMemo(() => (lectura && !sinEmpatar ? armarCarga(lectura, empates, hoy, archivoNombre) : null), [lectura, empates, sinEmpatar, hoy, archivoNombre]);
  const conFecha = preparado ? preparado.carga.asignaciones.filter((x) => x.f).length : 0;

  function cargarAhora() {
    if (!preparado) return;
    setResultado(null);
    iniciar(async () => {
      const r = await cargar(pilar, preparado.carga);
      setResultado(r);
      if (r.ok) setConfirmar(false);
    });
  }

  return (
    <details className="caja-panel group mb-6 overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
        <span>
          <span className="block text-lg font-semibold">Programa anual de mantenimiento</span>
          <span className="block text-[14px] text-suave">Sube el Excel del programa anual (formato CABLOMTO-F01): revisa activos, planes y almacenes y después cárgalos.</span>
        </span>
        <span aria-hidden="true" className="text-suave transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="space-y-6 border-t border-papel px-6 py-5">
        <label className="block">
          <span className="etiqueta">Archivo .xlsx</span>
          <input type="file" accept=".xlsx" onChange={(e) => alElegir(e.target.files?.[0])} aria-describedby="plan-anual-estado"
            className="campo cursor-pointer file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-papel file:px-4 file:py-1.5 file:text-[14px] file:font-medium" />
        </label>
        <p id="plan-anual-estado" aria-live="polite" className="text-[14px]">
          {cargando && <span className="text-suave">Leyendo el archivo…</span>}
          {error && <span role="alert" className="text-paro-texto">{error}</span>}
        </p>

        {lectura && (
          <>
            <p className="rounded-[18px] bg-alerta-suave px-5 py-4 text-[15px] text-alerta-texto">
              <strong className="font-semibold">Vista previa: nada se guarda hasta que confirmes la carga.</strong> Revisa que cada almacén
              del archivo corresponda al de Factory, las categorías y los problemas detectados.
            </p>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Activos", n(lectura.activos.length)],
                ["Almacenes", `${lectura.fichas.length}${sinEmpatar ? ` · ${sinEmpatar} sin elegir` : ""}`],
                ["Planes propuestos", n(lectura.planes.length)],
                ["Problemas", n(lectura.problemas.length)],
              ].map(([t, v]) => (
                <div key={t} className="rounded-[18px] bg-papel px-4 py-3">
                  <dt className="text-[13px] text-suave">{t}</dt>
                  <dd className="text-[22px] font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>

            {lectura.problemas.length > 0 && (
              <section aria-labelledby="pa-problemas">
                <h3 id="pa-problemas" className="mb-2 text-[17px] font-semibold">Problemas detectados</h3>
                <ul className="space-y-2">
                  {lectura.problemas.map((p) => (
                    <li key={p.tipo} className="rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">{p.texto}</li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="pa-almacenes">
              <h3 id="pa-almacenes" className="mb-1 text-[17px] font-semibold">Almacenes y su ficha</h3>
              <p className="mb-3 text-[14px] text-suave">Andenes y pasillos salen de las denominaciones (“Andén CDNQ 12”, “racks pasillo 05”); arman la nave en 3D.</p>
              {sinEmpatar > 1 && (
                <p className="mb-3 flex flex-wrap items-center gap-3 rounded-[14px] bg-papel px-4 py-3 text-[14px]">
                  <span>{sinEmpatar} almacenes del archivo no existen en Factory (o tienen varias opciones).</span>
                  <button type="button" className="btn-sec min-h-9 px-4 text-[14px]"
                    onClick={() => setEmpates((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v || OMITIR])))}>
                    No cargar los {sinEmpatar} sin elegir
                  </button>
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-[14px]">
                  <thead className="text-left text-[13px] text-suave">
                    <tr>{["Archivo", "Almacén en Factory", "Activos", "Andenes", "Pasillos", "Zonas", "Louvers · extractores · inyectores"].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {lectura.fichas.map((f) => {
                      const sug = sugerirAlmacen(f.almacen, almacenes);
                      return (
                        <tr key={f.almacen} className="border-t border-papel align-middle">
                          <td className="px-3 py-2 font-mono font-semibold">{f.almacen}</td>
                          <td className="px-3 py-2">
                            <label className="sr-only" htmlFor={`pa-alm-${f.almacen}`}>Almacén de Factory para {f.almacen}</label>
                            <select id={`pa-alm-${f.almacen}`} value={empates[f.almacen] ?? ""} onChange={(e) => setEmpates((x) => ({ ...x, [f.almacen]: e.target.value }))}
                              className={`selector min-h-9 w-full rounded-full py-0 pl-3.5 text-[14px] ${!empates[f.almacen] ? "bg-paro-suave text-paro-texto" : empates[f.almacen] === OMITIR ? "bg-panel-2 text-suave" : "bg-papel"}`}>
                              <option value="">{sug.opciones.length ? "Elige…" : "Sin empatar"}</option>
                              <option value={OMITIR}>No cargar este almacén</option>
                              {[...sug.opciones.map((id) => almacenes.find((a) => a.id === id)!).filter(Boolean),
                                ...almacenes.filter((a) => !sug.opciones.includes(a.id))].map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{n(f.activos)}</td>
                          <td className={`px-3 py-2 tabular-nums ${f.andenes ? "" : "text-paro-texto"}`}>{f.andenes || "falta"}</td>
                          <td className={`px-3 py-2 tabular-nums ${f.pasillos ? "" : "text-paro-texto"}`}>{f.pasillos || "falta"}</td>
                          <td className="px-3 py-2 text-suave">{f.zonas.map((z) => CATEGORIAS[z]).join(", ") || "—"}</td>
                          <td className="px-3 py-2 tabular-nums text-suave">{f.techo.louvers} · {f.techo.extractores} · {f.techo.inyectores}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="pa-planes">
              <h3 id="pa-planes" className="mb-1 text-[17px] font-semibold">Planes que se crearían</h3>
              <p className="mb-3 text-[14px] text-suave">Uno por categoría y frecuencia; se conservan los códigos de plan de SAP como referencia.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[14px]">
                  <thead className="text-left text-[13px] text-suave">
                    <tr>{["Plan", "Cada", "Activos", "Códigos SAP"].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(todosPlanes ? lectura.planes : lectura.planes.slice(0, 12)).map((p) => (
                      <tr key={p.nombre} className="border-t border-papel">
                        <td className="px-3 py-2 font-medium">{p.nombre}</td>
                        <td className="px-3 py-2 tabular-nums">{p.cada_dias} días</td>
                        <td className="px-3 py-2 tabular-nums">{n(p.activos)}</td>
                        <td className="px-3 py-2 font-mono text-[13px] text-suave">{p.codigos.slice(0, 6).join(", ")}{p.codigos.length > 6 ? ` +${p.codigos.length - 6}` : ""}</td>
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

            <section aria-labelledby="pa-activos">
              <h3 id="pa-activos" className="mb-3 text-[17px] font-semibold">Activos</h3>
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
                    <tr>{["Fila", "Almacén", "SAP", "Denominación", "Categoría", "Frecuencia", "Próximo programado", "Horas por servicio"].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtrados.slice(0, 60).map((a) => (
                      <tr key={a.fila} className="border-t border-papel">
                        <td className="px-3 py-1.5 tabular-nums text-suave">{a.fila}</td>
                        <td className="px-3 py-1.5 font-mono">{a.almacen}</td>
                        <td className="px-3 py-1.5 tabular-nums">{a.sinSap ? <span className="chip bg-alerta-suave text-alerta-texto">sin SAP</span> : a.sap}</td>
                        <td className="px-3 py-1.5">{a.denominacion}</td>
                        <td className="px-3 py-1.5">{CATEGORIAS[a.categoria]}</td>
                        <td className="px-3 py-1.5">{a.frecuencias.join(" · ") || <span className="text-paro-texto">sin plan</span>}</td>
                        <td className="px-3 py-1.5 tabular-nums">{(() => { const p = proximaProgramada(a, hoy); return p ? fechaCorta(p) : <span className="text-suave">—</span>; })()}</td>
                        <td className="px-3 py-1.5 tabular-nums">{a.horas ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[13px] text-suave">{filtrados.length > 60 ? `Mostrando 60 de ${n(filtrados.length)}.` : `${n(filtrados.length)} activos.`}</p>
            </section>

            <div className="space-y-3 border-t border-papel pt-4" aria-live="polite">
              {resultado && (
                <p role={resultado.ok ? "status" : "alert"}
                  className={`rounded-[14px] px-4 py-3 text-[15px] ${resultado.ok ? "bg-ok-suave text-ok-texto" : "bg-paro-suave text-paro-texto"}`}>{resultado.mensaje}</p>
              )}
              {confirmar && preparado ? (
                <div className="rounded-[18px] bg-papel p-4 text-[15px]">
                  <p className="font-semibold">¿Cargar el programa a Factory?</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
                    <li>{n(preparado.carga.activos.length)} activos de {new Set(preparado.carga.activos.map((a) => a.alm)).size} almacenes, con su categoría
                      {preparado.sapQuitados === 1 ? " (1 con SAP repetido se carga sin SAP)" : preparado.sapQuitados ? ` (${preparado.sapQuitados} con SAP repetido se cargan sin SAP)` : ""}.</li>
                    <li>{n(preparado.carga.planes.length)} planes y {n(preparado.carga.asignaciones.length)} asignaciones;
                      {" "}{n(conFecha)} arrancan en la fecha del programa y el resto a partir de hoy.</li>
                    {preparado.sinAlmacen > 0 && <li>{n(preparado.sinAlmacen)} activos de almacenes marcados “No cargar” se quedan fuera.</li>}
                    <li>{preparado.carga.fichas.length
                      ? `${n(preparado.carga.fichas.length)} fichas de almacén (andenes, pasillos y zonas).`
                      : "Este archivo no trae andenes ni pasillos: las fichas de almacén no se tocan."}</li>
                    <li>Si este archivo ya se cargó antes, se actualizan los mismos activos: no se duplica nada.</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={cargarAhora} disabled={guardando} className="btn-primario min-h-11">{guardando ? "Cargando…" : "Sí, cargar"}</button>
                    <button type="button" onClick={() => setConfirmar(false)} disabled={guardando} className="btn-sec min-h-11">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[14px] text-suave">
                    {sinEmpatar ? `Elige el almacén de Factory para ${sinEmpatar === 1 ? "el almacén marcado en rojo" : `los ${sinEmpatar} almacenes marcados en rojo`} antes de cargar.`
                      : "Revisa la vista previa; al cargar se guarda todo junto o nada."}
                  </p>
                  <button type="button" onClick={() => setConfirmar(true)} disabled={!preparado || guardando}
                    className="btn-primario min-h-11 disabled:cursor-not-allowed disabled:opacity-50">Cargar a Factory</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
