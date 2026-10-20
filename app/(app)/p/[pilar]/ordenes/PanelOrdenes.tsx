"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PRIORIDADES, puedeAsignar, puedeAtender } from "@/lib/catalogos";
import { Desplegable } from "@/components/Desplegable";
import { IcoAlerta, IcoAlmacen, IcoEquipo, IcoPersona } from "@/components/Iconos";
import { ahoraLocalInput, fechaHora, horas } from "@/lib/formato";
import { Aviso, ChipEstado, ChipPrioridad, Vacio } from "@/components/ui";
import type { Almacen, Equipo, Modo, OrdenDetalle, Origen, Pilar, Prioridad, Rol } from "@/lib/tipos";
import { asignarOrden, cancelarOrden, concluirOrden, iniciarOrden, type Resultado } from "../acciones";

type Props = {
  pilar: Pilar;
  ordenes: OrdenDetalle[];
  seleccion: string | null;
  rol: Rol;
  miId: string;
  tz: string;
  tecnicos: { id: string; nombre: string }[];
  origenes: Origen[];
  modos: Modo[];
  almacenes: Almacen[];
  equipos: Equipo[];
};

/** Color del tiempo abierto: verde < 8 h, ámbar < 48 h, rojo después (con el número siempre visible). */
function tonoHoras(h: number) {
  return h > 48 ? "text-paro-texto" : h > 8 ? "text-alerta-texto" : "text-suave";
}

export function PanelOrdenes(props: Props) {
  const { ordenes, pilar } = props;
  const [sel, setSel] = useState<string | null>(props.seleccion);
  const detalleRef = useRef<HTMLDivElement>(null);
  const actual = ordenes.find((o) => o.id_orden === sel) ?? null;

  useEffect(() => {
    if (sel && window.matchMedia("(max-width: 1023px)").matches) detalleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);

  if (ordenes.length === 0) {
    return (
      <Vacio titulo="No hay órdenes abiertas">
        {pilar === "dorsales" ? "Ninguna línea tiene solicitudes pendientes con estos filtros." : "Toda la flota de este pilar está operando."}
      </Vacio>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {ordenes.map((o, i) => {
          const h = Number(o.horas_transcurridas ?? 0);
          const activo = o.id_orden === sel;
          return (
            <li key={o.id_orden} className={`entrar entrar-${Math.min(i + 1, 4)}`}>
              <button
                onClick={() => setSel(o.id_orden)}
                aria-pressed={activo}
                className={`block w-full cursor-pointer rounded-caja p-5 text-left transition-colors duration-150 ${
                  activo ? "bg-tinta text-white" : "bg-panel hover:bg-panel-2"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="folio">{o.folio_ticket}</span>
                  <span className={`text-sm font-semibold tabular-nums ${activo ? "text-white" : tonoHoras(h)}`}>{horas(h)}</span>
                </div>
                <p className="mt-2 text-lg font-semibold leading-snug">
                  {pilar === "dorsales" ? (o.nombre_linea ?? "Sin línea") : (o.nombre_equipo ?? "Sin equipo")}
                </p>
                <p className={`text-sm ${activo ? "text-white/75" : "text-suave"}`}>
                  {[pilar === "dorsales" ? o.nombre_equipo : o.nombre_almacen, o.solicitante_nombre].filter(Boolean).join(" · ")}
                </p>
                <p className={`mt-3 line-clamp-2 text-[15px] ${activo ? "text-white/90" : ""}`}>{o.descripcion_falla}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activo ? (
                    <span className="chip bg-white/15 text-white">{o.estatus_orden === "en_proceso" ? "En proceso" : o.estatus_orden === "asignada" ? "Asignada" : "Pendiente"}</span>
                  ) : (
                    <ChipEstado e={o.estatus_orden} />
                  )}
                  {!activo && <ChipPrioridad p={o.prioridad} />}
                  {o.nombre_asignado && <span className={`chip ${activo ? "bg-white/15 text-white" : "bg-papel text-suave"}`}>{o.nombre_asignado}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <aside ref={detalleRef} className="scroll-mt-24 lg:sticky lg:top-24">
        {actual ? (
          <Detalle key={actual.id_orden} o={actual} {...props} onListo={() => setSel(null)} />
        ) : (
          <div className="caja-panel hidden p-8 text-[15px] text-suave lg:block">
            Elige una orden para ver el detalle{puedeAtender(props.rol) ? ", asignarla, iniciar la atención o concluirla." : puedeAsignar(props.rol) ? ", asignarla o darle seguimiento." : "."}
          </div>
        )}
      </aside>
    </div>
  );
}

function Detalle({ o, pilar, rol, miId, tz, tecnicos, origenes, modos, almacenes, equipos, onListo }: Props & { o: OrdenDetalle; onListo: () => void }) {
  const [pend, start] = useTransition();
  const [res, setRes] = useState<Resultado | null>(null);
  const [modo, setModo] = useState<"ver" | "asignar" | "cerrar" | "cancelar">("ver");
  const atiende = puedeAtender(rol);
  const asigna = puedeAsignar(rol);
  const puedeCancelar = asigna || (o.solicitante_id === miId && o.estatus_orden === "pendiente");

  function correr(fn: () => Promise<Resultado>) {
    setRes(null);
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok && (modo === "cerrar" || modo === "cancelar")) setTimeout(onListo, 1600);
      if (r.ok) setModo("ver");
    });
  }

  const filas: [string, React.ReactNode][] = [
    ...(pilar === "dorsales" ? [["Línea", o.nombre_linea] as [string, React.ReactNode]] : []),
    ["Equipo", o.nombre_equipo ?? "Por definir"],
    ...(o.sap_id ? [["Serie SAP", <span key="s" className="font-mono">{o.sap_id}</span>] as [string, React.ReactNode]] : []),
    ["Almacén", o.nombre_almacen ?? (pilar === "dorsales" ? "Se define al cierre" : "—")],
    ["Ingreso", fechaHora(o.fecha_ingreso, tz)],
    ["Tiempo abierta", horas(o.horas_transcurridas)],
    ["Solicitante", [o.solicitante_nombre, o.solicitante_correo].filter(Boolean).join(" · ")],
    ...(o.recibe_nombre ? [["Recibe", o.recibe_nombre] as [string, React.ReactNode]] : []),
    ["Asignada a", o.nombre_asignado ?? "Sin asignar"],
    ...(o.nombre_modo ? [["Componente", o.nombre_modo] as [string, React.ReactNode]] : []),
    ...(o.nombre_origen ? [["Causa", o.nombre_origen] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="caja-panel overflow-hidden">
      <div className="bg-tinta px-6 py-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <p className="folio text-xl">{o.folio_ticket}</p>
          <span className="chip bg-white/15 text-white">{o.estatus_orden === "en_proceso" ? "En proceso" : o.estatus_orden === "asignada" ? "Asignada" : "Pendiente"}</span>
        </div>
        <p className="mt-1 text-sm text-white/75">Prioridad {o.prioridad}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 px-6 py-5 text-[15px]">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-suave">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="px-6 pb-5">
        <p className="etiqueta">Descripción</p>
        <p className="whitespace-pre-wrap text-[15px]">{o.descripcion_falla}</p>
      </div>

      <div className="space-y-4 bg-papel px-6 py-5">
        {res && <Aviso tono={res.ok ? "ok" : "paro"}>{res.ok ? res.mensaje : res.error}</Aviso>}

        {modo === "ver" && (
          <div className="flex flex-wrap gap-2">
            {atiende && o.estatus_orden !== "en_proceso" && (
              <button className="btn-primario" disabled={pend} onClick={() => correr(() => iniciarOrden(pilar, o.id_orden))}>
                {pend ? "Iniciando…" : "Iniciar atención"}
              </button>
            )}
            {atiende && <button className="btn-motivo" onClick={() => setModo("cerrar")}>{o.id_equipo ? "Liberar equipo" : "Concluir solicitud"}</button>}
            {asigna && <button className="btn-sec" onClick={() => setModo("asignar")}>{o.asignado_a ? "Reasignar" : "Asignar"}</button>}
            {puedeCancelar && <button className="btn-peligro" onClick={() => setModo("cancelar")}>Cancelar</button>}
            {!atiende && !asigna && !puedeCancelar && <p className="text-[15px] text-suave">Mantenimiento ya tiene esta solicitud.</p>}
          </div>
        )}

        {modo === "asignar" && (
          <FormAsignar o={o} tecnicos={tecnicos} pend={pend} res={res}
            onCancelar={() => setModo("ver")}
            onEnviar={(t, p) => correr(() => asignarOrden(pilar, o.id_orden, t, p))} />
        )}
        {modo === "cerrar" && (
          <FormCerrar o={o} pilar={pilar} origenes={origenes} modos={modos} almacenes={almacenes} equipos={equipos} pend={pend} res={res}
            onCancelar={() => setModo("ver")}
            onEnviar={(d) => correr(() => concluirOrden(pilar, o.id_orden, d))} />
        )}
        {modo === "cancelar" && (
          <FormCancelar pend={pend} res={res} onCancelar={() => setModo("ver")}
            onEnviar={(m) => correr(() => cancelarOrden(pilar, o.id_orden, m))} />
        )}
      </div>
    </div>
  );
}

function errorDe(res: Resultado | null, campo: string) {
  return res && !res.ok ? res.campos?.[campo] : undefined;
}

function FormAsignar({ o, tecnicos, pend, res, onEnviar, onCancelar }: {
  o: OrdenDetalle; tecnicos: { id: string; nombre: string }[]; pend: boolean; res: Resultado | null;
  onEnviar: (t: string, p: Prioridad) => void; onCancelar: () => void;
}) {
  const [t, setT] = useState(o.asignado_a ?? "");
  const [p, setP] = useState<Prioridad>(o.prioridad);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onEnviar(t, p); }}>
      <div>
        <label htmlFor="asignar-a" className="etiqueta">Asignar a</label>
        <Desplegable id="asignar-a" value={t} onChange={setT} required invalido={!!errorDe(res, "tecnico")} icono={<IcoPersona />}
          opciones={tecnicos.map((x) => ({ valor: x.id, etiqueta: x.nombre }))} />
      </div>
      <fieldset>
        <legend className="etiqueta">Prioridad</legend>
        <div className="flex gap-2">
          {PRIORIDADES.map((x) => (
            <label key={x.valor} className={`btn min-h-10 flex-1 text-[15px] ${p === x.valor ? "bg-tinta text-white" : "bg-papel hover:bg-panel-2"}`}>
              <input type="radio" name="prioridad" value={x.valor} checked={p === x.valor} onChange={() => setP(x.valor)} className="sr-only" />
              {x.etiqueta}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button className="btn-primario flex-1" disabled={pend}>{pend ? "Guardando…" : "Asignar"}</button>
        <button type="button" className="btn-sec" onClick={onCancelar}>Volver</button>
      </div>
    </form>
  );
}

function FormCerrar({ o, pilar, origenes, modos, almacenes, equipos, pend, res, onEnviar, onCancelar }: {
  o: OrdenDetalle; pilar: Pilar; origenes: Origen[]; modos: Modo[]; almacenes: Almacen[]; equipos: Equipo[]; pend: boolean; res: Resultado | null;
  onEnviar: (d: { id_origen: string; id_modo: string; id_almacen: string; id_equipo: string; notas: string; fecha_cierre: string }) => void;
  onCancelar: () => void;
}) {
  const [origen, setOrigen] = useState(o.id_origen ?? "");
  const [modo, setModo] = useState(o.id_modo ?? "");
  const [almacen, setAlmacen] = useState(o.id_almacen ?? "");
  const [equipo, setEquipo] = useState(o.id_equipo ?? "");
  const [notas, setNotas] = useState("");
  const [fecha, setFecha] = useState(ahoraLocalInput);
  const equiposLinea = equipos.filter((e) => !o.id_linea || !e.id_linea || e.id_linea === o.id_linea);

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onEnviar({ id_origen: origen, id_modo: modo, id_almacen: almacen, id_equipo: equipo, notas, fecha_cierre: fecha ? new Date(fecha).toISOString() : "" });
    }}>
      <div>
        <label htmlFor="cierre-modo" className="etiqueta">Qué falló (componente o modo)</label>
        <Desplegable id="cierre-modo" value={modo} onChange={setModo} required invalido={!!errorDe(res, "id_modo")} describedBy="err-modo" icono={<IcoEquipo />}
          opciones={modos.map((x) => ({ valor: x.id_modo, etiqueta: x.nombre }))} />
        {errorDe(res, "id_modo") && <span id="err-modo" className="mt-1 block text-sm text-paro-texto">{errorDe(res, "id_modo")}</span>}
      </div>
      <div>
        <label htmlFor="cierre-causa" className="etiqueta">Por qué falló (causa)</label>
        <Desplegable id="cierre-causa" value={origen} onChange={setOrigen} required invalido={!!errorDe(res, "id_origen")} describedBy="err-origen" icono={<IcoAlerta />}
          opciones={origenes.map((x) => ({ valor: x.id_origen, etiqueta: x.nombre }))} />
        {errorDe(res, "id_origen") && <span id="err-origen" className="mt-1 block text-sm text-paro-texto">{errorDe(res, "id_origen")}</span>}
      </div>
      {pilar === "dorsales" && (
        <>
          <div>
            <label htmlFor="cierre-almacen" className="etiqueta">Almacén</label>
            <Desplegable id="cierre-almacen" value={almacen} onChange={setAlmacen} required invalido={!!errorDe(res, "id_almacen")} icono={<IcoAlmacen />}
              opciones={almacenes.map((x) => ({ valor: x.id_almacen, etiqueta: x.nombre_almacen }))} />
          </div>
          <div>
            <label htmlFor="cierre-equipo" className="etiqueta">Equipo atendido (opcional)</label>
            <Desplegable id="cierre-equipo" value={equipo} onChange={setEquipo} icono={<IcoEquipo />}
              opciones={[{ valor: "", etiqueta: "Sin equipo específico" }, ...equiposLinea.map((x) => ({ valor: x.id_equipo, etiqueta: x.nombre_equipo, detalle: x.sap_id ? `SAP ${x.sap_id}` : undefined }))]} />
          </div>
        </>
      )}
      <label className="block">
        <span className="etiqueta">Fecha y hora de cierre</span>
        <input type="datetime-local" className="campo" value={fecha} max={ahoraLocalInput()} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiqueta">Trabajo realizado</span>
        <textarea rows={3} className="campo" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Refacciones, ajustes, causa raíz…" />
      </label>
      <div className="flex gap-2">
        <button className="btn-motivo flex-1" disabled={pend}>{pend ? "Liberando…" : o.id_equipo ? "Liberar equipo y cerrar" : "Concluir solicitud"}</button>
        <button type="button" className="btn-sec" onClick={onCancelar}>Volver</button>
      </div>
    </form>
  );
}

function FormCancelar({ pend, res, onEnviar, onCancelar }: { pend: boolean; res: Resultado | null; onEnviar: (m: string) => void; onCancelar: () => void }) {
  const [m, setM] = useState("");
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onEnviar(m); }}>
      <label className="block">
        <span className="etiqueta">Motivo de la cancelación</span>
        <textarea rows={2} className="campo" value={m} onChange={(e) => setM(e.target.value)} required aria-invalid={!!errorDe(res, "motivo")}
          placeholder="Duplicada, se resolvió sola, error de captura…" />
      </label>
      <div className="flex gap-2">
        <button className="btn-peligro flex-1" disabled={pend}>{pend ? "Cancelando…" : "Cancelar solicitud"}</button>
        <button type="button" className="btn-sec" onClick={onCancelar}>Volver</button>
      </div>
    </form>
  );
}
