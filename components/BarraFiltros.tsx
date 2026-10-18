import Link from "next/link";
import { PERIODOS } from "@/lib/filtros";
import type { Equipo, Linea } from "@/lib/tipos";

/**
 * Fila de filtros (Línea · Equipo · Periodo) como en la app de Power Apps.
 * Es un formulario GET: funciona sin JavaScript y deja el filtro en la URL para compartirlo.
 */
export function BarraFiltros({
  resumen,
  lineas,
  equipos,
  valores,
  mostrarPeriodo = true,
  mostrarBusqueda = false,
  estados,
  periodoDefecto = "30d",
}: {
  resumen: string;
  lineas?: Linea[];
  equipos?: Equipo[];
  valores: { linea?: string; equipo?: string; periodo?: string; q?: string; estado?: string };
  mostrarPeriodo?: boolean;
  mostrarBusqueda?: boolean;
  estados?: { v: string; t: string }[];
  periodoDefecto?: string;
}) {
  const hayFiltro = Object.entries(valores).some(([k, v]) => v && !(k === "periodo" && v === periodoDefecto));
  return (
    <form method="get" className="entrar entrar-2 mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[17px] font-semibold">{resumen}</p>
        {hayFiltro && <Link href="?" className="enlace text-sm">Quitar filtros</Link>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {mostrarBusqueda && (
          <label className="w-full sm:w-64">
            <span className="etiqueta">Buscar</span>
            <input name="q" defaultValue={valores.q} placeholder="Folio, línea, equipo o solicitante" className="campo min-h-11" />
          </label>
        )}
        {lineas && lineas.length > 0 && (
          <label>
            <span className="etiqueta">Línea</span>
            <select name="linea" defaultValue={valores.linea ?? ""} className="campo min-h-11 w-auto pr-10">
              <option value="">Todas las líneas</option>
              {lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre_linea}</option>)}
            </select>
          </label>
        )}
        {equipos && equipos.length > 0 && (
          <label>
            <span className="etiqueta">Equipo</span>
            <select name="equipo" defaultValue={valores.equipo ?? ""} className="campo min-h-11 w-auto max-w-[260px] pr-10">
              <option value="">Todos los equipos</option>
              {equipos.map((e) => (
                <option key={e.id_equipo} value={e.id_equipo}>{e.nombre_equipo}{e.sap_id ? ` · ${e.sap_id}` : ""}</option>
              ))}
            </select>
          </label>
        )}
        {estados && (
          <label>
            <span className="etiqueta">Estado</span>
            <select name="estado" defaultValue={valores.estado ?? ""} className="campo min-h-11 w-auto pr-10">
              <option value="">Todos los estados</option>
              {estados.map((e) => <option key={e.v} value={e.v}>{e.t}</option>)}
            </select>
          </label>
        )}
        {mostrarPeriodo && (
          <label>
            <span className="etiqueta">Periodo</span>
            <select name="periodo" defaultValue={valores.periodo ?? "30d"} className="campo min-h-11 w-auto pr-10">
              {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
            </select>
          </label>
        )}
        <button className="btn-primario min-h-11">Aplicar</button>
      </div>
    </form>
  );
}
