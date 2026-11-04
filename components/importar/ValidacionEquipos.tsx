"use client";

// Revisión del importador: cada equipo del archivo contra los que ya están en Factory (lib/validarEquipos.ts).
import { useMemo, useState } from "react";
import { CATEGORIAS, type Activo, type Categoria } from "@/lib/planAnual";
import type { Coincidencia, Diferencia, Validacion } from "@/lib/validarEquipos";

type Tipo = Coincidencia["tipo"];
const n = (v: number) => v.toLocaleString("es-MX");

// Del más urgente al que no pide nada; el texto dice lo mismo que el color
const TIPOS: { tipo: Tipo; etiqueta: string; clase: string }[] = [
  { tipo: "repetido", etiqueta: "Repetidos en el archivo", clase: "bg-paro-suave text-paro-texto" },
  { tipo: "posible-duplicado", etiqueta: "Posibles duplicados", clase: "bg-paro-suave text-paro-texto" },
  { tipo: "baja", etiqueta: "Dados de baja", clase: "bg-paro-suave text-paro-texto" },
  { tipo: "diferente", etiqueta: "Con diferencias", clase: "bg-alerta-suave text-alerta-texto" },
  { tipo: "sap-otro-pilar", etiqueta: "SAP de otro pilar", clase: "bg-alerta-suave text-alerta-texto" },
  { tipo: "nuevo", etiqueta: "Nuevos", clase: "bg-info-suave text-info-texto" },
  { tipo: "igual", etiqueta: "Coinciden", clase: "bg-ok-suave text-ok-texto" },
];
const DIF: Record<Diferencia, string> = { almacen: "almacén", nombre: "nombre", categoria: "categoría" };
const lista = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : xs[0] ?? "");
const POR = { sap: "SAP", clave: "clave", nombre: "nombre en el mismo almacén" } as const;

function quePasa(c: Coincidencia) {
  switch (c.tipo) {
    case "igual": return `Ya existe igual (por ${POR[c.por!]}): solo se le liga el plan.`;
    case "diferente": return `Ya existe (por ${POR[c.por!]}) con otro ${lista((c.diferencias ?? []).map((d) => DIF[d]))}: la carga lo cambia al del archivo.`;
    case "baja": return "Ya existe pero está dado de baja: se le ligaría el plan igual.";
    case "nuevo": return "No existe en Factory: se da de alta.";
    case "posible-duplicado": return "No empata por SAP, clave ni nombre exacto, pero se parece a uno del mismo almacén: se daría de alta otro.";
    case "sap-otro-pilar": return "Su SAP ya lo usa un equipo de otro pilar: se da de alta sin SAP.";
    case "repetido": return "Otra fila del archivo ya cae en este mismo equipo de Factory: se juntarían en uno.";
  }
}

export function ValidacionEquipos({ estado, activos, nombreAlm, reintentar }: {
  estado: { ok: boolean; mensaje: string; validacion?: Validacion } | null;
  /** Activos leídos del archivo; Coincidencia.i apunta a esta lista. */
  activos: Activo[];
  nombreAlm: (id: string) => string | undefined;
  reintentar: () => void;
}) {
  const v = estado?.validacion;
  const porRevisar = v ? v.conteo.repetido + v.conteo["posible-duplicado"] + v.conteo.baja + v.conteo["sap-otro-pilar"] : 0;
  const primero = v ? TIPOS.find((t) => v.conteo[t.tipo] > 0)?.tipo : undefined;
  const [elegido, setElegido] = useState<Tipo | null>(null);
  const [todos, setTodos] = useState(false);
  const tipo = elegido && v?.conteo[elegido] ? elegido : primero;
  const filas = useMemo(() => (v && tipo ? v.coincidencias.filter((c) => c.tipo === tipo) : []), [v, tipo]);
  const sinArchivo = useMemo(() => {
    const m = new Map<string, Validacion["sinArchivo"]>();
    v?.sinArchivo.forEach((e) => { const k = nombreAlm(e.alm ?? "") ?? "Otro almacén"; m.set(k, [...(m.get(k) ?? []), e]); });
    return [...m].sort((a, b) => b[1].length - a[1].length);
  }, [v, nombreAlm]);

  return (
    <section aria-labelledby="imp-validacion">
      <h3 id="imp-validacion" className="mb-1 text-[17px] font-semibold">Equipos contra Factory</h3>
      <p className="mb-3 text-[14px] text-suave">Cada equipo del archivo comparado con los que ya están en Factory: por SAP, luego por clave y luego por nombre en el mismo almacén. Solo revisa; nada se guarda.</p>

      {!estado ? (
        <p role="status" aria-busy="true" className="rounded-[14px] bg-papel px-4 py-3 text-[14px] text-suave">Comparando con los equipos de Factory…</p>
      ) : !estado.ok || !v ? (
        <p role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-paro-suave px-4 py-3 text-[14px] text-paro-texto">
          <span>{estado.mensaje}</span>
          <button type="button" onClick={reintentar} className="btn-sec min-h-9 px-4 text-[14px]">Volver a comparar</button>
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Coinciden", v.conteo.igual, ""],
              ["Con diferencias", v.conteo.diferente, v.conteo.diferente ? "text-alerta-texto" : ""],
              ["Nuevos", v.conteo.nuevo, ""],
              ["Por revisar", porRevisar, porRevisar ? "text-paro-texto" : ""],
            ] as [string, number, string][]).map(([t, k, tono]) => (
              <div key={t} className="rounded-[18px] bg-papel px-4 py-3">
                <dt className="text-[13px] text-suave">{t}</dt>
                <dd className={`text-[22px] font-semibold tabular-nums ${tono}`}>{n(k)}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ver equipos por resultado">
            {TIPOS.filter((t) => v.conteo[t.tipo] > 0).map((t) => (
              <button key={t.tipo} type="button" aria-pressed={tipo === t.tipo} onClick={() => { setElegido(t.tipo); setTodos(false); }}
                className={`chip min-h-9 cursor-pointer ${tipo === t.tipo ? "bg-tinta text-sobre-tinta" : `${t.clase} hover:opacity-80`}`}>
                {t.etiqueta} <span className="tabular-nums opacity-70">{n(v.conteo[t.tipo])}</span>
              </button>
            ))}
          </div>

          {tipo && (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[860px] text-[14px]">
                  <thead className="text-left text-[13px] text-suave">
                    <tr>{["Fila", "Almacén", "SAP", "En el archivo", "En Factory", "Qué pasa"].map((h) => <th key={h} className="px-3 pb-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(todos ? filas : filas.slice(0, 40)).map((c) => {
                      const a = activos[c.i], e = c.equipo, d = new Set(c.diferencias ?? []);
                      const marca = (k: Diferencia) => (d.has(k) ? "font-medium text-alerta-texto" : "");
                      return (
                        <tr key={c.i} className="border-t border-papel align-top">
                          <td className="px-3 py-1.5 tabular-nums text-suave">{a?.fila}</td>
                          <td className="px-3 py-1.5 font-mono">{a?.almacen}</td>
                          <td className="px-3 py-1.5 tabular-nums">{a && !a.sinSap ? a.sap : <span className="text-suave">{a?.clave || "sin SAP"}</span>}</td>
                          <td className="px-3 py-1.5">{a?.denominacion}<span className="block text-[13px] text-suave">{a ? CATEGORIAS[a.categoria] : ""}</span></td>
                          <td className="px-3 py-1.5">
                            {e ? (
                              <>
                                <span className={marca("nombre")}>{e.nombre}</span>
                                <span className="block text-[13px] text-suave">
                                  {e.sap ?? e.clave ?? "sin SAP"} · <span className={marca("almacen")}>{nombreAlm(e.alm ?? "") ?? "otro almacén"}</span>
                                  {" · "}<span className={marca("categoria")}>{e.cat ? CATEGORIAS[e.cat as Categoria] ?? e.cat : "sin categoría"}</span>
                                </span>
                              </>
                            ) : <span className="text-suave">—</span>}
                          </td>
                          <td className="px-3 py-1.5">{quePasa(c)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filas.length > 40 && (
                <button type="button" onClick={() => setTodos((x) => !x)} className="enlace mt-2 cursor-pointer text-[14px]">
                  {todos ? "Ver menos" : `Ver los ${n(filas.length)}`}
                </button>
              )}
            </>
          )}

          {v.sinArchivo.length > 0 && (
            <details className="group/sin mt-4 rounded-[14px] bg-papel px-4 py-3 text-[14px]">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5">
                <span aria-hidden="true" className="transition-transform group-open/sin:rotate-90">›</span>
                <span><strong className="font-semibold tabular-nums">{n(v.sinArchivo.length)}</strong> {v.sinArchivo.length === 1 ? "equipo activo de Factory no viene" : "equipos activos de Factory no vienen"} en el archivo (de los mismos almacenes): se quedan como están, sin este plan.</span>
              </summary>
              <div className="mt-2 max-h-96 space-y-3 overflow-y-auto">
                {sinArchivo.map(([alm, es]) => (
                  <div key={alm}>
                    <p className="font-medium">{alm} <span className="tabular-nums text-suave">· {n(es.length)}</span></p>
                    <ul className="mt-1 divide-y divide-panel-2">
                      {es.map((e, k) => (
                        <li key={`${e.sap ?? e.clave ?? e.nombre}-${k}`} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                          <span className="min-w-0 break-words">{e.nombre}</span>
                          <span className="tabular-nums text-suave">{e.sap ?? e.clave ?? "sin SAP"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
