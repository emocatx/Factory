import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { esUuid, rangoPeriodo } from "@/lib/filtros";

import { fechaHora, horas } from "@/lib/formato";
import { ChipEstado, Vacio } from "@/components/ui";
import { BarraFiltros } from "@/components/BarraFiltros";
import type { OrdenDetalle } from "@/lib/tipos";

export const metadata = { title: "Órdenes cerradas" };

/** Solo lo que muestra la tabla y lo que usa la búsqueda. */
const COLUMNAS = "id_orden, folio_ticket, estatus_orden, fecha_ingreso, fecha_cierre, tiempo_paro_horas, notas_cierre, motivo_cancelacion, nombre_equipo, nombre_linea, nombre_almacen, nombre_modo, nombre_origen, sap_id, serie, solicitante_nombre";

export default async function Cerradas({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ q?: string; linea?: string; periodo?: string; estado?: string }>;
}) {
  const { pilar: p } = await params;
  const { tenant, pilar } = await sesionDePilar(p);
  const f = await searchParams;
  const { periodo, desde } = rangoPeriodo(f.periodo);
  const supabase = await createClient();

  let q = supabase.from("v_ordenes_detalle").select(COLUMNAS).eq("pilar", pilar)
    .in("estatus_orden", f.estado === "cancelada" ? ["cancelada"] : f.estado === "cerrada" ? ["cerrada"] : ["cerrada", "cancelada"])
    .order("fecha_ingreso", { ascending: false }).limit(300);
  if (desde) q = q.gte("fecha_ingreso", desde);
  if (esUuid(f.linea)) q = q.eq("id_linea", f.linea);
  // Solo Dorsales filtra por línea; los demás pilares no necesitan catálogos aquí.
  const [{ data }, lineas] = await Promise.all([q, pilar === "dorsales" ? catalogosPilar(pilar, { equipos: false }).then((c) => c.lineas) : undefined]);
  let ordenes = (data ?? []) as OrdenDetalle[];
  const t = f.q?.trim().toLowerCase();
  if (t) ordenes = ordenes.filter((o) => [o.folio_ticket, o.nombre_linea, o.nombre_equipo, o.sap_id, o.serie, o.solicitante_nombre].some((v) => v?.toLowerCase().includes(t)));

  return (
    <>
      <BarraFiltros
        resumen={`${ordenes.length} en ${periodo.t.toLowerCase()}`}
        lineas={lineas}
        valores={{ q: f.q, linea: f.linea, periodo: f.periodo, estado: f.estado }}
        mostrarBusqueda
        estados={[{ v: "cerrada", t: "Cerrada" }, { v: "cancelada", t: "Cancelada" }]}
      />
      {ordenes.length === 0 ? (
        <Vacio titulo="Sin solicitudes cerradas en este periodo">Amplía el periodo o quita filtros.</Vacio>
      ) : (
        <div className="caja-panel entrar entrar-3 overflow-x-auto">
          <table className="w-full min-w-[920px] text-[15px]">
            <thead className="text-left text-sm text-suave">
              <tr>
                {["Folio", pilar === "dorsales" ? "Línea / equipo" : "Equipo", "Falla", "Ingreso", "Cierre", "Paro", "Estado"].map((h, i) => (
                  <th key={h} className={`px-5 pb-2 pt-4 font-medium ${i === 5 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenes.map((o) => (
                <tr key={o.id_orden} className="align-top odd:bg-papel/60">
                  <td className="px-5 py-3"><span className="folio">{o.folio_ticket}</span></td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{pilar === "dorsales" ? o.nombre_linea : o.nombre_equipo}</p>
                    <p className="text-sm text-suave">{[pilar === "dorsales" ? o.nombre_equipo : null, o.nombre_almacen].filter(Boolean).join(" · ")}</p>
                    {o.notas_cierre && <p className="mt-1 max-w-sm text-sm">{o.notas_cierre}</p>}
                    {o.motivo_cancelacion && <p className="mt-1 max-w-sm text-sm text-suave">Cancelada: {o.motivo_cancelacion}</p>}
                  </td>
                  <td className="px-5 py-3"><p>{o.nombre_modo ?? "—"}</p><p className="text-sm text-suave">{o.nombre_origen ?? ""}</p></td>
                  <td className="px-5 py-3 tabular-nums">{fechaHora(o.fecha_ingreso, tenant.zona_horaria)}</td>
                  <td className="px-5 py-3 tabular-nums">{fechaHora(o.fecha_cierre, tenant.zona_horaria)}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{horas(o.tiempo_paro_horas)}</td>
                  <td className="px-5 py-3"><ChipEstado e={o.estatus_orden} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-sm text-suave">¿Buscas movimientos de todos los pilares? <Link href="/historial" className="underline">Ver historial completo</Link>.</p>
    </>
  );
}
