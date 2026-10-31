"use client";

import { useMemo, useState, useTransition } from "react";
import { Aviso } from "@/components/ui";
import { Desplegable, type Opcion } from "@/components/Desplegable";
import { sumarDias } from "@/lib/planes";
import { ETIQUETA_ESTATUS, MAX_MOTIVO, rangoSemana, semanaDe, type EstatusPrograma, type FilaLista } from "@/lib/programa";
import { asignarPrograma, cambiarEstatusPrograma } from "./accionesPrograma";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const corta = (iso: string) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}`;
const diaSemana = (iso: string) => (new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7;

/** Colores de estatus con tokens: completado verde, en ejecución azul, reprogramado naranja, no realizado rojo. */
const CHIP: Record<EstatusPrograma, string> = {
  programado: "bg-panel-2 text-suave",
  asignado: "bg-panel-2 text-tinta",
  en_ejecucion: "bg-info-suave text-info-texto",
  completado: "bg-ok-suave text-ok-texto",
  reprogramado: "bg-alerta-suave text-alerta-texto",
  no_realizado: "bg-paro-suave text-paro-texto",
};

/** A qué estatus se puede aplicar cada acción (lo mismo que valida la base). */
const APLICA = {
  completar: ["programado", "asignado", "en_ejecucion", "reprogramado", "no_realizado"],
  iniciar: ["programado", "asignado", "reprogramado"],
  reprogramar: ["programado", "asignado", "en_ejecucion", "reprogramado"],
  no_realizado: ["programado", "asignado", "en_ejecucion", "reprogramado"],
  asignar: ["programado", "asignado", "reprogramado"],
  regresar: ["asignado", "en_ejecucion", "completado", "reprogramado", "no_realizado"],
} as const satisfies Record<string, readonly EstatusPrograma[]>;
type Accion = keyof typeof APLICA;
/** Lo que un técnico puede tocar de lo suyo. */
const DEL_TECNICO: EstatusPrograma[] = ["asignado", "en_ejecucion", "reprogramado"];

type Props = {
  /** Prefijo de los id del formulario (hay dos listas en la página: vencidos y semana). */
  id: string;
  pilar: string;
  filas: FilaLista[];
  /** Lunes de la semana mostrada: la fecha que se propone al reprogramar si es futura. */
  desde?: string;
  /** "dia" para la semana; "semana" para los vencidos, que abarcan varias semanas y años. */
  agrupar?: "dia" | "semana";
  hoy: string;
  yo: string;
  /** Admin, supervisor o coordinador: todo el programa del pilar. */
  editor: boolean;
  /** Puede cambiar estatus (editor o técnico). */
  cambia: boolean;
  filtrado: boolean;
  responsables: Opcion[];
};

/** Servicios por día (o por semana), con selección múltiple y acciones sobre lo elegido. */
export function ListaSemana({ id, pilar, filas, desde, agrupar = "dia", hoy, yo, editor, cambia, filtrado, responsables }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<Accion | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [res, setRes] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pend, iniciar] = useTransition();

  const elegible = (f: FilaLista) => cambia && (editor || (f.id_responsable === yo && DEL_TECNICO.includes(f.estatus)));
  const elegibles = useMemo(() => filas.filter(elegible), [filas]); // eslint-disable-line react-hooks/exhaustive-deps
  // Los mismos límites que valida la base (cambiar_estatus_programa): completar hasta 7 días atrás el técnico y 90
  // los editores, nunca a futuro; reprogramar de hoy a 30 días el técnico y 366 los editores.
  const limites = {
    completar: { min: sumarDias(hoy, editor ? -90 : -7), max: hoy },
    reprogramar: { min: hoy, max: sumarDias(hoy, editor ? 366 : 30) },
  };
  // Grupos por fecha (día) o por el lunes de la semana ISO (semana).
  const dias = useMemo(() => {
    const m = new Map<string, FilaLista[]>();
    for (const f of filas) {
      const k = agrupar === "semana" ? lunesDe(f.fecha_programada) : f.fecha_programada;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [filas, agrupar]);
  const elegidas = filas.filter((f) => sel.has(f.id));
  const paraAccion = (a: Accion) => elegidas.filter((f) => (APLICA[a] as readonly string[]).includes(f.estatus)).map((f) => f.id);

  function alternar(ids: string[], marcar: boolean) {
    setSel((s) => { const n = new Set(s); for (const id of ids) { if (marcar) n.add(id); else n.delete(id); } return n; });
  }
  function abrir(a: Accion) {
    setRes(null); setMotivo(""); setFecha(a === "reprogramar" && desde && desde > hoy && desde <= limites.reprogramar.max ? desde : hoy); setResponsable("");
    setModo(a);
  }
  function correr(a: Accion) {
    const ids = paraAccion(a);
    setRes(null);
    iniciar(async () => {
      const r = a === "asignar" ? await asignarPrograma(pilar, ids, responsable)
        : await cambiarEstatusPrograma(pilar, ids,
          { completar: "completado", iniciar: "en_ejecucion", reprogramar: "reprogramado", no_realizado: "no_realizado", regresar: "programado" }[a],
          { fecha: a === "completar" || a === "reprogramar" ? fecha : undefined, motivo: a === "reprogramar" || a === "no_realizado" ? motivo : undefined });
      setRes(r);
      if (r.ok) { setSel(new Set()); setModo(null); }
    });
  }

  if (filas.length === 0) {
    return (
      <p className="border-t border-papel px-5 py-12 text-center text-[15px] text-suave">
        {filtrado ? "Ningún servicio de esta semana coincide con los filtros." : "No hay servicios programados esta semana."}
      </p>
    );
  }

  const botones: { a: Accion; t: string; visible: boolean }[] = [
    { a: "iniciar", t: "Iniciar", visible: true },
    { a: "reprogramar", t: "Reprogramar", visible: true },
    { a: "no_realizado", t: "No realizado", visible: true },
    { a: "asignar", t: "Asignar responsable", visible: editor },
    { a: "regresar", t: "Regresar a programado", visible: editor },
  ];
  const n = (a: Accion) => paraAccion(a).length;

  return (
    <div>
      {res && <div className="px-5 pb-3"><Aviso tono={res.ok ? "ok" : "paro"}>{res.mensaje}</Aviso></div>}

      {elegibles.length > 0 && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-papel bg-papel px-5 text-[14px] font-medium">
          <input type="checkbox" className="h-5 w-5" checked={elegibles.every((f) => sel.has(f.id))}
            onChange={(e) => alternar(elegibles.map((f) => f.id), e.target.checked)} />
          {editor ? `Seleccionar todos (${elegibles.length})` : `Todos los míos (${elegibles.length})`}
          <span className="ml-auto whitespace-nowrap text-suave tabular-nums">{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</span>
        </label>
      )}

      {dias.map(([dia, xs]) => {
        const propios = xs.filter(elegible);
        const hechos = xs.filter((x) => x.estatus === "completado").length;
        return (
          <div key={dia}>
            <div className="flex min-h-11 items-center gap-3 border-t border-papel px-5 pt-3 pb-1">
              {propios.length > 0 && (
                <input type="checkbox" className="h-5 w-5"
                  aria-label={`Seleccionar los de ${agrupar === "semana" ? tituloSemana(dia).toLowerCase() : `${DIAS[diaSemana(dia)].toLowerCase()} ${corta(dia)}`}`}
                  checked={propios.every((f) => sel.has(f.id))} onChange={(e) => alternar(propios.map((f) => f.id), e.target.checked)} />
              )}
              {agrupar === "semana" ? (
                <h3 className="text-[15px] font-semibold">{tituloSemana(dia)}</h3>
              ) : (
                <h3 className={`text-[15px] font-semibold ${dia === hoy ? "text-azul" : ""}`}>
                  {DIAS[diaSemana(dia)]} {corta(dia)}{dia === hoy ? " · hoy" : ""}
                </h3>
              )}
              <span className="ml-auto shrink-0 text-[13px] text-suave tabular-nums">
                {agrupar === "semana" ? `${xs.length} servicio${xs.length === 1 ? "" : "s"}` : `${hechos} de ${xs.length} completado${xs.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <ul>
              {xs.map((f) => <Fila key={f.id} f={f} elegible={elegible(f)} marcada={sel.has(f.id)} alternar={(v) => alternar([f.id], v)} />)}
            </ul>
          </div>
        );
      })}

      {sel.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-3 mb-3 mt-2 rounded-[18px] bg-panel p-4 shadow-[0_12px_40px_rgb(0_0_0/0.14),0_0_0_1px_rgb(0_0_0/0.04)] motion-safe:animate-[abrir_150ms_var(--ease-salida)]">
          {modo === null || modo === "iniciar" || modo === "regresar" ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
              <p className="mr-auto text-[15px] font-semibold tabular-nums sm:order-first">{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</p>
              <button type="button" className="enlace min-h-10 px-2 text-[15px] sm:order-last" onClick={() => setSel(new Set())}>Quitar selección</button>
              {/* En celular las acciones van en una fila que se desliza (la barra no tapa la lista); desde sm, en línea */}
              <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
                <button type="button" className="btn-primario min-h-11 shrink-0" disabled={pend || !n("completar")} onClick={() => abrir("completar")}>Completar</button>
                {botones.filter((b) => b.visible).map((b) => (
                  <button key={b.a} type="button" className="btn-sec min-h-11 shrink-0 text-[15px]" disabled={pend || !n(b.a)}
                    onClick={() => (b.a === "iniciar" || b.a === "regresar" ? correr(b.a) : abrir(b.a))}>
                    {b.t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); correr(modo); }}>
              <p className="w-full text-[15px] font-semibold">
                {{ completar: "Completar", reprogramar: "Reprogramar", no_realizado: "Marcar como no realizado", asignar: "Asignar responsable" }[modo]}
                {" "}{n(modo)} servicio{n(modo) === 1 ? "" : "s"}
                {n(modo) < sel.size && <span className="font-normal text-suave"> · {sel.size - n(modo)} no aplica{sel.size - n(modo) === 1 ? "" : "n"} por su estatus</span>}
              </p>
              {(modo === "completar" || modo === "reprogramar") && (
                <label className="w-full sm:w-auto">
                  <span className="etiqueta">{modo === "completar" ? "Fecha realizada" : "Nueva fecha"}</span>
                  <input type="date" required className="campo min-h-11" value={fecha} onChange={(e) => setFecha(e.target.value)}
                    min={limites[modo].min} max={limites[modo].max} aria-describedby={`${id}-limite`} />
                  <span id={`${id}-limite`} className="mt-1 block text-[12px] text-suave">
                    {modo === "completar" ? `Del ${corta(limites.completar.min)} a hoy` : `De hoy al ${corta(limites.reprogramar.max)} ${limites.reprogramar.max.slice(0, 4)}`}
                  </span>
                </label>
              )}
              {(modo === "reprogramar" || modo === "no_realizado") && (
                <label className="min-w-0 flex-1 basis-60">
                  <span className="etiqueta">Motivo</span>
                  <input required maxLength={MAX_MOTIVO} className="campo min-h-11" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder={modo === "reprogramar" ? "Ej. Equipo en operación, sin ventana" : "Ej. Falta de refacción"} />
                </label>
              )}
              {modo === "asignar" && (
                <div className="min-w-0 flex-1 basis-60">
                  <label htmlFor={`${id}-responsable`} className="etiqueta">Responsable</label>
                  <Desplegable id={`${id}-responsable`} arriba value={responsable} onChange={setResponsable} opciones={responsables} placeholder="Elige técnico o supervisor" />
                </div>
              )}
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button className={`${modo === "completar" ? "btn-primario" : "btn-sec"} min-h-11 flex-1 sm:flex-none`}
                  disabled={pend || !n(modo) || (modo === "asignar" && !responsable)}>
                  {pend ? "Guardando…" : { completar: "Completar", reprogramar: "Reprogramar", no_realizado: "Guardar", asignar: "Asignar" }[modo]}
                </button>
                <button type="button" className="enlace min-h-11 px-2 text-[15px]" onClick={() => setModo(null)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Lunes de la semana ISO de una fecha. */
function lunesDe(iso: string) {
  const s = semanaDe(iso);
  return rangoSemana(s.anio, s.semana)!.desde;
}

/** "Semana 42 · 13–19 oct 2025" (o "29 sep–5 oct" si cambia de mes), a partir del lunes. */
function tituloSemana(lunes: string) {
  const domingo = sumarDias(lunes, 6);
  const inicio = lunes.slice(5, 7) === domingo.slice(5, 7) ? String(+lunes.slice(8, 10)) : corta(lunes);
  return `Semana ${semanaDe(lunes).semana} · ${inicio}–${corta(domingo)} ${domingo.slice(0, 4)}`;
}

function Fila({ f, elegible, marcada, alternar }: { f: FilaLista; elegible: boolean; marcada: boolean; alternar: (v: boolean) => void }) {
  const ref = f.sap_id ? `SAP ${f.sap_id}` : f.clave_id;
  const detalle = f.estatus === "completado" && f.fecha_realizada ? `Hecho el ${corta(f.fecha_realizada)}`
    : f.fecha_original ? `Era el ${corta(f.fecha_original)}${f.motivo ? ` · ${f.motivo}` : ""}`
    : f.motivo;
  const contenido = (
    <>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[15px] font-semibold leading-snug">
          {f.nombre_equipo}
          {ref && <span className="ml-2 font-mono text-[13px] font-normal text-suave">{ref}</span>}
        </p>
        <p className="text-[13px] text-suave">{[f.plan, f.nombre_almacen ?? "Sin almacén"].join(" · ")}</p>
        {detalle && <p className="truncate text-[13px] text-suave" title={detalle}>{detalle}</p>}
      </div>
      <div className={`flex flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:pl-0 ${elegible ? "w-full pl-8" : "w-full"}`}>
        <span className={`text-[13px] ${f.responsable ? "" : "text-suave"}`}>{f.responsable ?? "Sin asignar"}</span>
        <span className={`chip ${CHIP[f.estatus]}`}>{ETIQUETA_ESTATUS[f.estatus]}</span>
        {f.vencido && <span className="chip bg-paro-suave text-paro-texto">Vencido</span>}
      </div>
    </>
  );
  return (
    <li className="border-t border-papel first:border-t-0">
      {elegible ? (
        <label className={`flex min-h-14 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 transition-colors duration-150 hover:bg-papel/60 ${marcada ? "bg-papel/60" : ""}`}>
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={marcada} onChange={(e) => alternar(e.target.checked)} aria-label={`Seleccionar ${f.nombre_equipo} · ${f.plan}`} />
          {contenido}
        </label>
      ) : (
        <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">{contenido}</div>
      )}
    </li>
  );
}
