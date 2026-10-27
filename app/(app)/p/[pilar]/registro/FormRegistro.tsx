"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { PRIORIDADES } from "@/lib/catalogos";
import { ahoraLocalInput } from "@/lib/formato";
import { refEquipo } from "@/lib/equipos";
import { Aviso } from "@/components/ui";
import { Diente } from "@/components/Sierra";
import { Desplegable } from "@/components/Desplegable";
import { IcoAlmacen, IcoCapas, IcoEquipo } from "@/components/Iconos";
import type { Almacen, Equipo, Linea, Origen, Pilar, Prioridad } from "@/lib/tipos";
import { registrarSolicitud, validarFolio, type Resultado } from "../acciones";

type Props = {
  pilar: Pilar;
  operaciones: boolean;
  usuario: { nombre: string; correo: string };
  almacenes: Almacen[];
  lineas: Linea[];
  equipos: Equipo[];
  origenes: Origen[];
  /** Folio de la orden abierta que tiene detenido a cada equipo. */
  detenidos: Record<string, string>;
};

const ETIQUETAS: Record<string, string> = {
  folio: "Folio",
  id_linea: "Línea",
  id_equipo: "Equipo",
  solicitante_nombre: "Solicitante",
  descripcion: "Descripción",
};

export function FormRegistro({ pilar, operaciones, usuario, almacenes, lineas, equipos, origenes, detenidos }: Props) {
  const dorsal = pilar === "dorsales";
  const vacio = {
    folio: "", id_linea: "", id_almacen: "", id_equipo: "", id_origen: "",
    prioridad: "media" as Prioridad, fecha_ingreso: ahoraLocalInput(),
    solicitante_nombre: operaciones ? usuario.nombre : "", solicitante_correo: operaciones ? usuario.correo : "",
    recibe_nombre: operaciones ? "" : usuario.nombre, descripcion: "",
  };
  const [d, setD] = useState(vacio);
  const [autoFolio, setAutoFolio] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [folioMsg, setFolioMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();
  const resumenRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const err = (c: string) => (res && !res.ok ? res.campos?.[c] : undefined);

  const opcionesEquipo = useMemo(
    () => equipos.filter((e) => (dorsal ? !d.id_linea || e.id_linea === d.id_linea || !e.id_linea : e.id_almacen === d.id_almacen)),
    [equipos, dorsal, d.id_linea, d.id_almacen],
  );

  /** Un equipo detenido (con orden abierta) no admite otra orden: aparece deshabilitado con su folio. */
  const opcEquipos = opcionesEquipo.map((e) => {
    const folio = detenidos[e.id_equipo];
    return {
      valor: e.id_equipo,
      etiqueta: e.nombre_equipo,
      detalle: [refEquipo(e), folio ? `Detenido · orden ${folio}` : "Disponible"].filter(Boolean).join(" · "),
      deshabilitada: !!folio || e.estatus === "en_paro",
      tono: (folio || e.estatus === "en_paro" ? "paro" : "ok") as "paro" | "ok",
    };
  }).sort((x, y) => Number(x.deshabilitada) - Number(y.deshabilitada));
  const disponibles = opcEquipos.filter((o) => !o.deshabilitada).length;

  async function revisarFolio() {
    if (autoFolio || !d.folio.trim()) return setFolioMsg(null);
    setFolioMsg((await validarFolio(d.folio)) ? "Folio disponible" : "Ese folio ya existe");
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setRes(null);
    start(async () => {
      const r = await registrarSolicitud(pilar, {
        ...d,
        folio: autoFolio ? "" : d.folio,
        fecha_ingreso: d.fecha_ingreso ? new Date(d.fecha_ingreso).toISOString() : "",
      });
      setRes(r);
      if (r.ok) {
        setD({ ...vacio, fecha_ingreso: ahoraLocalInput() });
        setFolioMsg(null);
      } else {
        requestAnimationFrame(() => resumenRef.current?.focus());
      }
    });
  }

  const camposConError = res && !res.ok && res.campos ? Object.entries(res.campos) : [];

  return (
    <form onSubmit={enviar} noValidate className="entrar entrar-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-8">
        {camposConError.length > 0 && (
          <div ref={resumenRef} tabIndex={-1} role="alert" aria-labelledby="titulo-errores" className="rounded-caja bg-paro-suave p-5 text-paro-texto outline-none">
            <h2 id="titulo-errores" className="font-semibold">Hay {camposConError.length === 1 ? "un dato" : `${camposConError.length} datos`} por corregir</h2>
            <ul className="mt-2 space-y-1 text-[15px]">
              {camposConError.map(([c, m]) => (
                <li key={c}><a href={`#${c}`} className="underline">{ETIQUETAS[c] ?? c}: {m}</a></li>
              ))}
            </ul>
          </div>
        )}
        {res?.ok && (
          <Aviso tono="ok">
            Solicitud registrada con folio <span className="folio">{res.folio}</span>.{" "}
            <Link href={`/p/${pilar}/ordenes`} className="font-semibold underline">Ver {operaciones ? "seguimiento" : "órdenes abiertas"}</Link>
          </Aviso>
        )}

        <Bloque titulo={dorsal ? "Folio y línea" : "Activo"}>
          {dorsal ? (
            <>
              <Campo id="folio" etiqueta="Folio" error={err("folio")} ayuda={folioMsg ?? (autoFolio ? "Se asigna al guardar, por ejemplo DOR-00001" : "Único en tu organización")}>
                <input id="folio" className="campo font-mono uppercase placeholder:normal-case" value={autoFolio ? "" : d.folio} disabled={autoFolio}
                  placeholder={autoFolio ? "Automático" : "Ej. F-1234"} onChange={(e) => set("folio", e.target.value)} onBlur={revisarFolio}
                  aria-invalid={!!err("folio") || folioMsg === "Ese folio ya existe"} />
                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[15px]">
                  <input type="checkbox" className="h-5 w-5" checked={autoFolio} onChange={(e) => { setAutoFolio(e.target.checked); setFolioMsg(null); }} />
                  Generar folio automático
                </label>
              </Campo>
              <Campo id="id_linea" etiqueta="Línea" error={err("id_linea")}>
                <Desplegable id="id_linea" value={d.id_linea} onChange={(v) => { set("id_linea", v); set("id_equipo", ""); }} invalido={!!err("id_linea")}
                  icono={<IcoCapas />} placeholder="Selecciona línea" opciones={lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))} />
              </Campo>
              <Campo id="id_equipo" etiqueta="Equipo (opcional)" ayuda="Si operaciones no sabe qué equipo es, mantenimiento lo define al cerrar.">
                <Desplegable id="id_equipo" value={d.id_equipo} onChange={(v) => set("id_equipo", v)} icono={<IcoEquipo />}
                  opciones={[{ valor: "", etiqueta: "Sin equipo específico" }, ...opcEquipos]} />
              </Campo>
            </>
          ) : (
            <>
              <Campo id="id_almacen" etiqueta="Almacén">
                <Desplegable id="id_almacen" value={d.id_almacen} onChange={(v) => { set("id_almacen", v); set("id_equipo", ""); }} icono={<IcoAlmacen />}
                  placeholder="Selecciona almacén" opciones={almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))} />
              </Campo>
              <Campo id="id_equipo" etiqueta="Equipo" error={err("id_equipo")} ayuda={d.id_almacen && opcEquipos.length ? `${disponibles} disponible${disponibles === 1 ? "" : "s"} de ${opcEquipos.length}. Los detenidos ya tienen una orden abierta: libéralos desde Órdenes.` : undefined}>
                <Desplegable id="id_equipo" value={d.id_equipo} disabled={!d.id_almacen} onChange={(v) => set("id_equipo", v)} invalido={!!err("id_equipo")} icono={<IcoEquipo />}
                  placeholder={d.id_almacen ? (opcEquipos.length ? (disponibles ? "Selecciona equipo" : "Todos los equipos de este almacén están detenidos") : "Este almacén no tiene equipos de este pilar") : "Primero elige el almacén"}
                  opciones={opcEquipos} />
              </Campo>
              <Campo id="fecha_ingreso" etiqueta="Fecha y hora del ingreso">
                <input id="fecha_ingreso" type="datetime-local" className="campo" value={d.fecha_ingreso} max={ahoraLocalInput()} onChange={(e) => set("fecha_ingreso", e.target.value)} />
              </Campo>
              {/* El folio lo asigna quien registra, del formato recibido; se valida que no esté repetido. */}
              <Campo id="folio" etiqueta="Folio de la orden" error={err("folio")} ayuda={folioMsg ?? "El que viene en el formato recibido. No se puede repetir."}>
                <input id="folio" className="campo font-mono uppercase placeholder:font-sans placeholder:normal-case" value={d.folio} maxLength={20}
                  placeholder="Folio del formato" onChange={(e) => { set("folio", e.target.value); setFolioMsg(null); }} onBlur={revisarFolio}
                  aria-invalid={!!err("folio") || folioMsg === "Ese folio ya existe"} />
              </Campo>
            </>
          )}
        </Bloque>

        <Bloque titulo="Falla">
          {!operaciones && (
            <Campo id="id_origen" etiqueta="Causa probable (opcional)" ayuda="Mantenimiento la confirma al cerrar junto con el componente que falló.">
              <Desplegable id="id_origen" value={d.id_origen} onChange={(v) => set("id_origen", v)}
                opciones={[{ valor: "", etiqueta: "Por definir" }, ...origenes.map((o) => ({ valor: o.id_origen, etiqueta: o.nombre }))]} />
            </Campo>
          )}
          <Campo id="descripcion" etiqueta="Descripción" error={err("descripcion")} completo>
            <textarea id="descripcion" rows={5} className="campo" value={d.descripcion} onChange={(e) => set("descripcion", e.target.value)}
              placeholder={dorsal ? "Describe el problema reportado por operaciones" : "Qué se observó, en qué condiciones, acciones tomadas"} aria-invalid={!!err("descripcion")} />
          </Campo>
          <fieldset className="md:col-span-2">
            <legend className="etiqueta">Prioridad</legend>
            <div className="flex max-w-md gap-2">
              {PRIORIDADES.map((x) => (
                <label key={x.valor} className={`btn min-h-11 flex-1 text-[15px] ${d.prioridad === x.valor ? "bg-tinta text-sobre-tinta" : "bg-papel hover:bg-panel-2"}`}>
                  <input type="radio" name="prioridad" className="sr-only" checked={d.prioridad === x.valor} onChange={() => set("prioridad", x.valor)} />
                  {x.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
        </Bloque>

        <Bloque titulo="Responsables">
          <Campo id="solicitante_nombre" etiqueta="Solicitante" error={err("solicitante_nombre")}>
            <input id="solicitante_nombre" className="campo" placeholder="Quién reporta la falla" value={d.solicitante_nombre} readOnly={operaciones}
              onChange={(e) => set("solicitante_nombre", e.target.value)} aria-invalid={!!err("solicitante_nombre")} />
          </Campo>
          {dorsal || operaciones ? (
            <Campo id="solicitante_correo" etiqueta="Correo del solicitante">
              <input id="solicitante_correo" type="email" className="campo" placeholder="nombre@empresa.com" value={d.solicitante_correo} readOnly={operaciones}
                onChange={(e) => set("solicitante_correo", e.target.value)} />
            </Campo>
          ) : (
            <Campo id="recibe_nombre" etiqueta="Recibe">
              <input id="recibe_nombre" className="campo" value={d.recibe_nombre} onChange={(e) => set("recibe_nombre", e.target.value)} />
            </Campo>
          )}
        </Bloque>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="caja-panel p-6">
          <p className="text-lg font-semibold">{dorsal ? "Generar solicitud" : "Registrar ingreso"}</p>
          <ul className="mt-3 space-y-2 text-[15px] text-suave">
            {(dorsal
              ? ["Mantenimiento la recibe como Pendiente.", "Se asigna a un técnico y se atiende.", "Al cerrar se define almacén y origen."]
              : ["El equipo pasa a En paro.", "Se asigna y se atiende.", "Al cerrar se mide el tiempo de paro."]
            ).map((t) => (
              <li key={t} className="flex gap-2.5"><Diente className="mt-1.5 h-3 w-3 shrink-0" />{t}</li>
            ))}
          </ul>
          <button className="btn-motivo mt-6 w-full" disabled={pend}>{pend ? "Enviando…" : dorsal || operaciones ? "Enviar solicitud" : "Registrar"}</button>
        </div>
      </aside>
    </form>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="caja-panel p-6">
      <legend className="float-left mb-5 w-full text-xl font-semibold">{titulo}</legend>
      <div className="clear-both grid gap-5 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Campo({ id, etiqueta, error, ayuda, completo, children }: {
  id: string; etiqueta: string; error?: string; ayuda?: string; completo?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={completo ? "md:col-span-2" : ""}>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      {children}
      {error ? <p className="mt-1.5 text-sm font-medium text-paro-texto">{error}</p> : ayuda ? <p className="mt-1.5 text-sm text-suave">{ayuda}</p> : null}
    </div>
  );
}
