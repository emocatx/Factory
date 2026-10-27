"use client";

import { useMemo, useState, useTransition } from "react";
import { aFilas, leerArchivoTabla } from "@/lib/tabla";
import { Desplegable } from "@/components/Desplegable";
import { COLUMNAS_HISTORIAL, convertirHistorial, type Catalogo, type EquipoRef, type Fila, type OrdenFecha } from "@/lib/historial";
import type { FallaImport } from "@/app/(app)/p/[pilar]/equipos/acciones";

type Importar = (pilar: string, fallas: FallaImport[]) => Promise<{ ok: boolean; mensaje: string; insertadas: number; omitidas: number }>;

const BLOQUE = 300;
const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const [f, h] = iso.split("T");
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a} ${h.slice(0, 5)}`;
};

export function ImportarHistorial({ pilar, equipos, almacenes, origenes, modos, importar }: {
  pilar: string;
  equipos: EquipoRef[];
  almacenes: Catalogo[];
  origenes: Catalogo[];
  modos: Catalogo[];
  importar: Importar;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const [orden, setOrden] = useState<OrdenFecha | undefined>();
  const [conAbiertas, setConAbiertas] = useState(false);
  const [verAvisos, setVerAvisos] = useState(false);
  const [progreso, setProgreso] = useState<string>();
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pend, start] = useTransition();

  const r = useMemo(
    () => (filas.length ? convertirHistorial(filas, { equipos, almacenes, origenes, modos }, orden) : null),
    [filas, equipos, almacenes, origenes, modos, orden],
  );
  const aImportar = r ? [...r.cerradas, ...(conAbiertas ? r.abiertas : [])] : [];
  const graves = r?.avisos.filter((a) => a.grave).length ?? 0;

  async function cargar(archivo: File | undefined) {
    setRes(null); setErrorArchivo(undefined); setFilas([]); setOrden(undefined);
    if (!archivo) return;
    setNombreArchivo(archivo.name);
    try {
      const tabla = await leerArchivoTabla(archivo);
      if (!tabla) return setErrorArchivo("Usa un archivo .xlsx o .csv.");
      const f = aFilas(tabla, COLUMNAS_HISTORIAL);
      if (!f.length) return setErrorArchivo("El archivo no tiene filas con datos.");
      if (!f.some((x) => x.fecha)) return setErrorArchivo("No se encontró una columna de fecha (Fecha, FechaHora o Fecha de ingreso).");
      setFilas(f);
    } catch {
      setErrorArchivo("No se pudo leer el archivo. Revisa que no esté protegido.");
    }
  }

  function enviar() {
    start(async () => {
      let ins = 0, omit = 0;
      const lote: FallaImport[] = aImportar.map((o) => ({
        ref: o.ref, id_equipo: o.id_equipo, id_almacen: o.id_almacen, id_origen: o.id_origen, id_modo: o.id_modo,
        descripcion: o.descripcion, solicitante: o.solicitante, recibe: o.recibe, fecha_ingreso: o.fecha_ingreso, fecha_cierre: o.fecha_cierre,
      }));
      for (let i = 0; i < lote.length; i += BLOQUE) {
        setProgreso(`Importando ${Math.min(i + BLOQUE, lote.length)} de ${lote.length}…`);
        const x = await importar(pilar, lote.slice(i, i + BLOQUE));
        if (!x.ok) {
          setProgreso(undefined);
          return setRes({ ok: false, texto: `Se detuvo después de ${ins} importadas: ${x.mensaje}` });
        }
        ins += x.insertadas; omit += x.omitidas;
      }
      setProgreso(undefined);
      setRes({ ok: true, texto: `${ins} falla(s) importadas al historial${omit ? `; ${omit} ya existían o no pasaron la validación y se omitieron` : ""}. Los indicadores ya las consideran.` });
      setFilas([]);
    });
  }

  return (
    <details className="caja-panel group mb-6 overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
        <span>
          <span className="block text-lg font-semibold">Importar historial de fallas</span>
          <span className="block text-[14px] text-suave">Sube tu registro previo (Excel o CSV) para alimentar indicadores y análisis de falla.</span>
        </span>
        <span aria-hidden="true" className="text-suave transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="space-y-5 border-t border-papel px-6 py-5">
        <div className="grid gap-3 text-[14px] text-suave md:grid-cols-2">
          <div className="rounded-[14px] bg-papel p-4">
            <p className="font-semibold text-tinta">Bitácora de eventos</p>
            <p className="mt-1">Una fila por movimiento con <strong className="font-medium text-tinta">Tipo de evento</strong> = Ingreso o Salida. Cada ingreso se empareja con la siguiente salida del mismo equipo.</p>
          </div>
          <div className="rounded-[14px] bg-papel p-4">
            <p className="font-semibold text-tinta">Una fila por falla</p>
            <p className="mt-1">Con <strong className="font-medium text-tinta">Fecha de ingreso</strong> y <strong className="font-medium text-tinta">Fecha de cierre</strong>. Sin cierre, la falla se considera abierta.</p>
          </div>
        </div>
        <p className="text-[14px] text-suave">
          El equipo se busca por <strong className="font-medium text-tinta">Serie SAP</strong>, clave o nombre: da de alta los equipos antes. También se leen Almacén, Causa (origen de falla),
          Componente, Descripción, Solicitante, Recibe y Folio. Si importas el mismo archivo dos veces, las fallas repetidas se omiten.
        </p>

        <label className="block">
          <span className="etiqueta">Archivo .xlsx o .csv</span>
          <input type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => cargar(e.target.files?.[0])}
            className="campo cursor-pointer file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-papel file:px-4 file:py-1.5 file:text-[14px] file:font-medium" />
          {errorArchivo && <span role="alert" className="mt-1 block text-sm text-paro-texto">{errorArchivo}</span>}
        </label>

        {r && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px]">
              <span>{nombreArchivo}: <strong className="font-semibold">{filas.length}</strong> filas leídas como {r.modo === "eventos" ? "bitácora de eventos" : "una fila por falla"}.</span>
              <div className="inline-flex items-center gap-2">
                <label htmlFor="hist-fechas" className="text-suave">Fechas</label>
                <Desplegable id="hist-fechas" compacto value={r.ordenFecha} onChange={(v) => setOrden(v as OrdenFecha)}
                  opciones={[{ valor: "dmy", etiqueta: "día/mes/año" }, { valor: "mdy", etiqueta: "mes/día/año" }]} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Cifra valor={r.cerradas.length} titulo="Fallas cerradas" sub="Ingreso con su salida" tono="ok" />
              <Cifra valor={r.abiertas.length} titulo="Sin salida" sub="Siguen abiertas en el archivo" tono="alerta" />
              <Cifra valor={graves} titulo="Filas omitidas" sub="Revisa el detalle abajo" tono={graves ? "paro" : "ok"} />
            </div>

            {r.causasSinCatalogo.length > 0 && (
              <p className="rounded-[14px] bg-alerta-suave px-4 py-3 text-[14px] text-alerta-texto">
                Causas que no están en el catálogo (quedan como &quot;Sin clasificar&quot;): {r.causasSinCatalogo.map(([t, n]) => `${t} (${n})`).join(", ")}.
                Si quieres conservarlas, agrégalas en Configuración → Por qué falla y vuelve a cargar el archivo.
              </p>
            )}

            {r.avisos.length > 0 && (
              <div>
                <button type="button" onClick={() => setVerAvisos(!verAvisos)} className="enlace cursor-pointer text-[14px]" aria-expanded={verAvisos}>
                  {verAvisos ? "Ocultar" : "Ver"} {r.avisos.length} aviso(s) por fila ›
                </button>
                {verAvisos && (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-[14px] bg-papel p-3 text-[14px]">
                    {r.avisos.map((a, i) => (
                      <li key={i} className={a.grave ? "text-paro-texto" : "text-alerta-texto"}><span className="tabular-nums text-suave">Fila {a.fila + 1}:</span> {a.texto}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {(r.cerradas.length > 0 || r.abiertas.length > 0) && (
              <div className="max-h-80 overflow-auto rounded-[14px] bg-papel">
                <table className="w-full min-w-[760px] text-[14px]">
                  <thead className="sticky top-0 bg-papel text-left text-suave">
                    <tr>{["Equipo", "Almacén", "Ingreso", "Salida", "Horas", "Causa", "Descripción"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[...r.cerradas, ...r.abiertas].slice(0, 200).map((o, i) => (
                      <tr key={i} className="odd:bg-panel/60 align-top">
                        <td className="px-3 py-1.5">{o.equipo}</td>
                        <td className="px-3 py-1.5">{o.almacen || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmt(o.fecha_ingreso)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{o.fecha_cierre ? fmt(o.fecha_cierre) : <span className="text-alerta-texto">Abierta</span>}</td>
                        <td className="px-3 py-1.5 tabular-nums">{o.horas ?? "—"}</td>
                        <td className="px-3 py-1.5">{o.origen}</td>
                        <td className="max-w-[280px] truncate px-3 py-1.5" title={o.descripcion}>{o.descripcion || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {r.abiertas.length > 0 && (
              <label className="flex items-start gap-3 text-[15px]">
                <input type="checkbox" checked={conAbiertas} onChange={(e) => setConAbiertas(e.target.checked)} className="mt-0.5 h-5 w-5" />
                <span>
                  Importar también las {r.abiertas.length} fallas sin salida como órdenes abiertas.
                  <span className="block text-[14px] text-suave">Esos equipos quedarán detenidos en Factory hasta que se liberen. Déjalo sin marcar si en el archivo faltó registrar salidas.</span>
                </span>
              </label>
            )}
          </>
        )}

        {res && (
          <p role={res.ok ? "status" : "alert"} className={`rounded-[14px] px-4 py-3 text-[15px] ${res.ok ? "bg-ok-suave text-ok-texto" : "bg-paro-suave text-paro-texto"}`}>{res.texto}</p>
        )}

        <button type="button" className="btn-primario" disabled={pend || aImportar.length === 0} aria-busy={pend} onClick={enviar}>
          {pend ? progreso ?? "Importando…" : `Importar ${aImportar.length || ""} falla${aImportar.length === 1 ? "" : "s"}`.trim()}
        </button>
      </div>
    </details>
  );
}

function Cifra({ valor, titulo, sub, tono }: { valor: number; titulo: string; sub: string; tono: "ok" | "alerta" | "paro" }) {
  const color = { ok: "text-ok-texto", alerta: "text-alerta-texto", paro: "text-paro-texto" }[tono];
  return (
    <div className="rounded-[18px] bg-papel p-4">
      <p className={`text-3xl font-semibold tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1 text-[15px] font-medium">{titulo}</p>
      <p className="text-[13px] text-suave">{sub}</p>
    </div>
  );
}
