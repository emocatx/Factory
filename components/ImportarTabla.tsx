"use client";

import { useMemo, useState, useTransition } from "react";
import { aFilas, leerArchivoTabla, partirTexto } from "@/lib/tabla";

export type { Columna } from "@/lib/tabla";
import type { Columna } from "@/lib/tabla";
export type ResultadoImport = { ok: boolean; mensaje: string; detalle?: string[] };
type Fila = Record<string, string>;

export function ImportarTabla({
  columnas,
  titulo,
  ayuda,
  nombrePlantilla,
  validar,
  importar,
  opcion,
}: {
  columnas: Columna[];
  titulo: string;
  ayuda: string;
  nombrePlantilla: string;
  /** Devuelve el error de la fila, un aviso (texto que empieza con "!") o null. `todas` detecta duplicados en el archivo. */
  validar: (f: Fila, i: number, todas: Fila[]) => string | null;
  importar: (filas: Fila[], opcion: boolean) => Promise<ResultadoImport>;
  opcion?: { etiqueta: string; porDefecto?: boolean };
}) {
  const [modo, setModo] = useState<"pegar" | "archivo">("pegar");
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const [extra, setExtra] = useState(opcion?.porDefecto ?? false);
  const [res, setRes] = useState<ResultadoImport | null>(null);
  const [pend, start] = useTransition();

  const errores = useMemo(() => filas.map((f, i) => validar(f, i, filas)), [filas, validar]);
  const esError = (e: string | null) => !!e && !e.startsWith("!");
  const validas = filas.filter((_, i) => !esError(errores[i]));

  function desdeTexto(t: string) {
    setTexto(t);
    setRes(null);
    setFilas(aFilas(partirTexto(t), columnas));
  }

  async function desdeArchivo(archivo: File | undefined) {
    setRes(null); setErrorArchivo(undefined); setFilas([]);
    if (!archivo) return;
    try {
      const tabla = await leerArchivoTabla(archivo);
      if (!tabla) setErrorArchivo("Usa un archivo .xlsx o .csv. Si es .xls viejo, guárdalo como .xlsx o copia y pega las celdas.");
      else setFilas(aFilas(tabla, columnas));
    } catch {
      setErrorArchivo("No se pudo leer el archivo. Revisa que no esté protegido o copia y pega las celdas.");
    }
  }

  function descargarPlantilla() {
    const csv = [columnas.map((c) => c.etiqueta).join(","), columnas.map((c) => c.ejemplo ?? "").join(",")].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nombrePlantilla; a.click();
    URL.revokeObjectURL(url);
  }

  function enviar() {
    start(async () => {
      const r = await importar(validas, extra);
      setRes(r);
      if (r.ok) { setFilas([]); setTexto(""); }
    });
  }

  return (
    <details className="caja-panel group mb-6 overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
        <span>
          <span className="block text-lg font-semibold">{titulo}</span>
          <span className="block text-[14px] text-suave">{ayuda}</span>
        </span>
        <span aria-hidden="true" className="text-suave transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="space-y-4 border-t border-papel px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Origen de los datos" className="inline-flex rounded-full bg-papel p-1 text-[14px]">
            {([["pegar", "Pegar desde Excel"], ["archivo", "Subir archivo"]] as const).map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => { setModo(v); setFilas([]); setRes(null); }}
                className={`min-h-9 cursor-pointer rounded-full px-4 ${modo === v ? "bg-tinta font-medium text-sobre-tinta" : "text-tinta hover:bg-panel-2"}`}>{t}</button>
            ))}
          </div>
          <button type="button" onClick={descargarPlantilla} className="enlace cursor-pointer text-[14px]">Descargar plantilla ›</button>
        </div>

        <p className="text-[14px] text-suave">
          Columnas: {columnas.map((c) => <span key={c.clave}><strong className="font-medium text-tinta">{c.etiqueta}</strong>{c.requerida ? "" : " (opcional)"}</span>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), [])}.
          {" "}Puede llevar encabezados o no (en ese caso, en ese orden).
        </p>

        {modo === "pegar" ? (
          <label className="block">
            <span className="sr-only">Datos pegados</span>
            <textarea value={texto} onChange={(e) => desdeTexto(e.target.value)} rows={6} className="campo font-mono text-[14px]"
              placeholder={[columnas.map((c) => c.etiqueta).join("\t"), columnas.map((c) => c.ejemplo ?? "").join("\t")].join("\n")} />
          </label>
        ) : (
          <label className="block">
            <span className="etiqueta">Archivo .xlsx o .csv</span>
            <input type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => desdeArchivo(e.target.files?.[0])}
              className="campo cursor-pointer file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-papel file:px-4 file:py-1.5 file:text-[14px] file:font-medium" />
            {errorArchivo && <span role="alert" className="mt-1 block text-sm text-paro-texto">{errorArchivo}</span>}
          </label>
        )}

        {filas.length > 0 && (
          <div>
            <p className="mb-2 text-[15px]">
              <strong className="font-semibold">{validas.length}</strong> listas para importar
              {filas.length - validas.length > 0 && <span className="text-paro-texto"> · {filas.length - validas.length} con error (no se importan)</span>}
            </p>
            <div className="max-h-80 overflow-auto rounded-[14px] bg-papel">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead className="sticky top-0 bg-papel text-left text-suave">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    {columnas.map((c) => <th key={c.clave} className="px-3 py-2 font-medium">{c.etiqueta}</th>)}
                    <th className="px-3 py-2 font-medium">Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 300).map((f, i) => (
                    <tr key={i} className={esError(errores[i]) ? "bg-paro-suave/60" : "odd:bg-panel/60"}>
                      <td className="px-3 py-1.5 tabular-nums text-suave">{i + 1}</td>
                      {columnas.map((c) => <td key={c.clave} className="px-3 py-1.5">{f[c.clave] || <span className="text-suave">—</span>}</td>)}
                      <td className={`px-3 py-1.5 ${esError(errores[i]) ? "text-paro-texto" : errores[i] ? "text-alerta-texto" : "text-ok-texto"}`}>{errores[i] ? errores[i]!.replace(/^!/, "") : "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 300 && <p className="mt-1 text-[13px] text-suave">Se muestran las primeras 300 de {filas.length}; se importan todas las válidas.</p>}
          </div>
        )}

        {opcion && (
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} className="h-5 w-5" /> {opcion.etiqueta}
          </label>
        )}

        {res && (
          <div role={res.ok ? "status" : "alert"} className={`rounded-[14px] px-4 py-3 text-[15px] ${res.ok ? "bg-ok-suave text-ok-texto" : "bg-paro-suave text-paro-texto"}`}>
            <p>{res.mensaje}</p>
            {res.detalle && res.detalle.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-[14px]">{res.detalle.map((d, i) => <li key={i}>{d}</li>)}</ul>
            )}
          </div>
        )}

        <button type="button" className="btn-primario" disabled={pend || validas.length === 0} aria-busy={pend} onClick={enviar}>
          {pend ? "Importando…" : `Importar ${validas.length || ""}`.trim()}
        </button>
      </div>
    </details>
  );
}
