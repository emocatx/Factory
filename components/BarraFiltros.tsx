import Link from "next/link";
import { PERIODO_DEFECTO, PERIODOS } from "@/lib/filtros";
import { refEquipo } from "@/lib/equipos";
import { Desplegable } from "./Desplegable";
import { FormFiltros } from "./FormFiltros";
import type { Almacen, Equipo, Linea } from "@/lib/tipos";

/**
 * Fila de filtros (Línea · Almacén · Equipo · Periodo) en píldoras, como las del Resumen: la etiqueta va dentro.
 * Deja el filtro en la URL para compartirlo; se aplica sin recargar la página (ver FormFiltros).
 */
export function BarraFiltros({
  resumen,
  lineas,
  almacenes,
  equipos,
  valores,
  mostrarPeriodo = true,
  mostrarBusqueda = false,
  estados,
  periodoDefecto = PERIODO_DEFECTO,
  enEncabezado = false,
}: {
  resumen?: string;
  lineas?: Linea[];
  almacenes?: Almacen[];
  equipos?: Equipo[];
  valores: { linea?: string; almacen?: string; equipo?: string; periodo?: string; q?: string; estado?: string };
  mostrarPeriodo?: boolean;
  mostrarBusqueda?: boolean;
  estados?: { v: string; t: string }[];
  periodoDefecto?: string;
  /** Solo los controles, para ir a la derecha del título (el alcance va como subtítulo). */
  enEncabezado?: boolean;
}) {
  const hayFiltro = Object.entries(valores).some(([k, v]) => v && !(k === "periodo" && v === periodoDefecto));
  return (
    // relative z-30: la animación .entrar crea un contexto de apilamiento; sin esto las tarjetas
    // de abajo tapan la lista desplegable y no se puede elegir una opción.
    <FormFiltros className={enEncabezado ? "relative z-30 flex flex-wrap items-center gap-2"
      // -mt-4: el resumen queda pegado al título, como subtítulo (Órdenes, donde el selector ocupa la fila del título).
      : "group entrar entrar-2 relative z-30 -mt-3 mb-6 flex flex-wrap items-center justify-between gap-4"}>
      {!enEncabezado && (
        <div className="min-w-0 self-start">
          <p className="text-[15px] text-suave">{resumen}</p>
          {hayFiltro && <Link href="?" className="enlace text-sm">Quitar filtros</Link>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mostrarBusqueda && (
          <input key={valores.q ?? ""} name="q" defaultValue={valores.q} aria-label="Buscar" placeholder="Buscar folio, equipo o solicitante"
            className="campo min-h-10 w-full rounded-full border-borde bg-panel px-4 text-[14px] sm:w-64" />
        )}
        {lineas && lineas.length > 0 && (
          <Desplegable key={`linea-${valores.linea ?? ""}`} id="f-linea" name="linea" etiqueta="Línea" compacto autoEnviar defaultValue={valores.linea ?? ""}
            opciones={[{ valor: "", etiqueta: "Todas" }, ...lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))]} />
        )}
        {almacenes && almacenes.length > 0 && (
          <Desplegable key={`almacen-${valores.almacen ?? ""}`} id="f-almacen" name="almacen" etiqueta="Almacén" compacto autoEnviar defaultValue={valores.almacen ?? ""} className="max-w-[300px]"
            opciones={[{ valor: "", etiqueta: "Todos" }, ...almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))]} />
        )}
        {equipos && equipos.length > 0 && (
          <Desplegable key={`equipo-${valores.equipo ?? ""}`} id="f-equipo" name="equipo" etiqueta="Equipo" compacto autoEnviar defaultValue={valores.equipo ?? ""} className="max-w-[300px]"
            opciones={[{ valor: "", etiqueta: "Todos" }, ...equipos.map((e) => ({ valor: e.id_equipo, etiqueta: e.nombre_equipo, detalle: refEquipo(e) ?? undefined }))]} />
        )}
        {estados && (
          <Desplegable key={`estado-${valores.estado ?? ""}`} id="f-estado" name="estado" etiqueta="Estado" compacto autoEnviar defaultValue={valores.estado ?? ""}
            opciones={[{ valor: "", etiqueta: "Todos" }, ...estados.map((e) => ({ valor: e.v, etiqueta: e.t }))]} />
        )}
        {mostrarPeriodo && (
          <Desplegable key={`periodo-${valores.periodo ?? ""}`} id="f-periodo" name="periodo" etiqueta="Periodo" compacto autoEnviar defaultValue={valores.periodo ?? periodoDefecto}
            opciones={PERIODOS.map((p) => ({ valor: p.v, etiqueta: p.t }))} />
        )}
        {/* Lo que esta página no muestra (periodo en Órdenes abiertas, equipo que llega del Resumen) viaja oculto. */}
        {!mostrarPeriodo && valores.periodo && <input type="hidden" name="periodo" value={valores.periodo} />}
        {!(almacenes && almacenes.length > 0) && valores.almacen && <input type="hidden" name="almacen" value={valores.almacen} />}
        {!(equipos && equipos.length > 0) && valores.equipo && <input type="hidden" name="equipo" value={valores.equipo} />}
        {/* Las listas se aplican solas; el botón queda oculto para el envío con Enter y sin JavaScript. */}
        <button className="sr-only">Aplicar</button>
        {enEncabezado && hayFiltro && <Link href="?" className="enlace px-2 text-sm">Quitar filtros</Link>}
      </div>
    </FormFiltros>
  );
}
