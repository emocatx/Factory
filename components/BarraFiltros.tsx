import Link from "next/link";
import { PERIODOS } from "@/lib/filtros";
import { Desplegable } from "./Desplegable";
import { FormFiltros } from "./FormFiltros";
import { IcoAlmacen, IcoCalendario, IcoEquipo, IcoFiltro } from "./Iconos";
import type { Almacen, Equipo, Linea } from "@/lib/tipos";

/**
 * Fila de filtros (Línea · Almacén · Equipo · Periodo) como en la app de Power Apps.
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
  periodoDefecto = "30d",
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
    <FormFiltros className={enEncabezado ? "relative z-30 flex flex-wrap items-end gap-3"
      // -mt-4: el resumen queda pegado al título, como subtítulo (Órdenes, donde el selector ocupa la fila del título).
      : "group entrar entrar-2 relative z-30 -mt-4 mb-8 flex flex-wrap items-end justify-between gap-4"}>
      {!enEncabezado && (
        <div className="min-w-0 self-start">
          <p className="text-[17px] text-suave">{resumen}</p>
          {hayFiltro && <Link href="?" className="enlace text-sm">Quitar filtros</Link>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {mostrarBusqueda && (
          <label className="w-full sm:w-64">
            <span className="etiqueta">Buscar</span>
            <input key={valores.q ?? ""} name="q" defaultValue={valores.q} placeholder="Folio, línea, equipo o solicitante" className="campo min-h-11" />
          </label>
        )}
        {lineas && lineas.length > 0 && (
          <div>
            <label htmlFor="f-linea" className="etiqueta">Línea</label>
            <Desplegable key={valores.linea ?? ""} id="f-linea" name="linea" compacto autoEnviar defaultValue={valores.linea ?? ""}
              opciones={[{ valor: "", etiqueta: "Todas las líneas" }, ...lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))]} />
          </div>
        )}
        {almacenes && almacenes.length > 0 && (
          <div className="max-w-[300px]">
            <label htmlFor="f-almacen" className="etiqueta">Almacén</label>
            <Desplegable key={valores.almacen ?? ""} id="f-almacen" name="almacen" compacto autoEnviar defaultValue={valores.almacen ?? ""} icono={<IcoAlmacen />}
              opciones={[{ valor: "", etiqueta: "Todos los almacenes" }, ...almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))]} />
          </div>
        )}
        {equipos && equipos.length > 0 && (
          <div className="max-w-[300px]">
            <label htmlFor="f-equipo" className="etiqueta">Equipo</label>
            <Desplegable key={valores.equipo ?? ""} id="f-equipo" name="equipo" compacto autoEnviar defaultValue={valores.equipo ?? ""} icono={<IcoEquipo />}
              opciones={[{ valor: "", etiqueta: "Todos los equipos" }, ...equipos.map((e) => ({ valor: e.id_equipo, etiqueta: e.nombre_equipo, detalle: e.sap_id ? `SAP ${e.sap_id}` : undefined }))]} />
          </div>
        )}
        {estados && (
          <div>
            <label htmlFor="f-estado" className="etiqueta">Estado</label>
            <Desplegable key={valores.estado ?? ""} id="f-estado" name="estado" compacto autoEnviar defaultValue={valores.estado ?? ""} icono={<IcoFiltro />}
              opciones={[{ valor: "", etiqueta: "Todos los estados" }, ...estados.map((e) => ({ valor: e.v, etiqueta: e.t }))]} />
          </div>
        )}
        {mostrarPeriodo && (
          <div>
            <label htmlFor="f-periodo" className="etiqueta">Periodo</label>
            <Desplegable key={valores.periodo ?? ""} id="f-periodo" name="periodo" compacto autoEnviar defaultValue={valores.periodo ?? periodoDefecto} icono={<IcoCalendario />}
              opciones={PERIODOS.map((p) => ({ valor: p.v, etiqueta: p.t }))} />
          </div>
        )}
        {/* Las listas se aplican solas; el botón queda oculto para el envío con Enter y sin JavaScript. */}
        <button className="sr-only">Aplicar</button>
        {enEncabezado && hayFiltro && <Link href="?" className="enlace mb-2.5 text-sm">Quitar filtros</Link>}
      </div>
    </FormFiltros>
  );
}
