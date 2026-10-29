import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/lib/sesion";
import { Encabezado, ChipEstado, Segmentado, Vacio } from "@/components/ui";
import { ESTADOS, etiquetaPilar, PILARES } from "@/lib/catalogos";
import { fechaHora, horas } from "@/lib/formato";
import type { EventoBitacora, Linea, OrdenDetalle } from "@/lib/tipos";
import { Desplegable } from "@/components/Desplegable";

export const metadata = { title: "Historial" };

const POR_PAGINA = 50;

type Filtros = { vista?: string; mes?: string; semana?: string; linea?: string; estado?: string; pilar?: string; p?: string };

/** "2026-W42" → [lunes, lunes siguiente] en UTC-ish (fechas YYYY-MM-DD) */
function rangoSemana(s: string): [string, string] | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, w] = [Number(m[1]), Number(m[2])];
  const ene4 = new Date(Date.UTC(y, 0, 4));
  const lunes = new Date(ene4);
  lunes.setUTCDate(ene4.getUTCDate() - ((ene4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  const fin = new Date(lunes);
  fin.setUTCDate(lunes.getUTCDate() + 7);
  return [lunes.toISOString().slice(0, 10), fin.toISOString().slice(0, 10)];
}

function rangoMes(s: string): [string, string] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const fin = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return [`${s}-01`, fin];
}

const ACCIONES: Record<string, string> = {
  alta: "Alta", edicion: "Edición", asignacion: "Asignación", inicio: "Inicio de atención", cierre: "Cierre", reapertura: "Reapertura", cancelacion: "Cancelación",
  baja: "Baja", paro: "Entró en paro", liberacion: "Liberado", importacion: "Carga del programa anual",
};

export default async function Historial({ searchParams }: { searchParams: Promise<Filtros> }) {
  const { tenant, perfil } = await obtenerSesion();
  const f = await searchParams;
  const vista = f.vista === "bitacora" ? "bitacora" : "ordenes";
  const pagina = Math.max(1, Number(f.p) || 1);
  const supabase = await createClient();

  const rango = (f.semana && rangoSemana(f.semana)) || (f.mes && rangoMes(f.mes)) || null;
  const desdeTz = (d: string) => `${d}T00:00:00-06:00`; // zona de captura por defecto

  const { data: lineasData } = await supabase.from("lineas_dorsales").select("id_linea, nombre_linea, activo").order("nombre_linea");
  const lineas = (lineasData ?? []) as Linea[];

  let ordenes: OrdenDetalle[] = [];
  let eventos: EventoBitacora[] = [];
  let total = 0;

  if (vista === "ordenes") {
    let q = supabase.from("v_ordenes_detalle").select("*", { count: "exact" });
    if (rango) q = q.gte("fecha_ingreso", desdeTz(rango[0])).lt("fecha_ingreso", desdeTz(rango[1]));
    if (f.linea) q = q.eq("id_linea", f.linea);
    if (f.estado === "abiertas") q = q.in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);
    else if (f.estado) q = q.eq("estatus_orden", f.estado);
    if (f.pilar) q = q.eq("pilar", f.pilar);
    const { data, count } = await q
      .order("fecha_ingreso", { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    ordenes = (data ?? []) as OrdenDetalle[];
    total = count ?? 0;
  } else {
    let q = supabase.from("bitacora").select("*", { count: "exact" });
    if (rango) q = q.gte("fecha", desdeTz(rango[0])).lt("fecha", desdeTz(rango[1]));
    const { data, count } = await q.order("fecha", { ascending: false }).range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
    eventos = (data ?? []) as EventoBitacora[];
    total = count ?? 0;
  }

  const { data: personas } = await supabase.from("usuarios_perfiles").select("id, nombre");
  const nombreDe = new Map((personas ?? []).map((p) => [p.id as string, p.nombre as string]));
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const qs = (extra: Partial<Filtros>) =>
    "?" + new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Encabezado ruta={[{ href: "/", texto: "Pilares" }]} titulo="Historial general" sub={`Registro de auditoría de ${tenant.nombre_empresa}.`}>
        <Segmentado etiqueta="Vista" actual={vista}
          opciones={[{ v: "ordenes", t: "Órdenes", href: qs({ vista: "ordenes", p: "" }) }, { v: "bitacora", t: "Movimientos", href: qs({ vista: "bitacora", p: "" }) }]} />
      </Encabezado>

      <form className="caja-panel mb-6 grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6" method="get">
        <input type="hidden" name="vista" value={vista} />
        <div>
          <label className="etiqueta" htmlFor="mes">Mes</label>
          <input id="mes" name="mes" type="month" className="campo" defaultValue={f.mes} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="semana">Semana</label>
          <input id="semana" name="semana" type="week" className="campo" defaultValue={f.semana} />
        </div>
        {vista === "ordenes" && (
          <>
            <div>
              <label className="etiqueta" htmlFor="linea">Línea</label>
              <Desplegable id="linea" name="linea" defaultValue={f.linea ?? ""}
                opciones={[{ valor: "", etiqueta: "Todas" }, ...lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))]} />
            </div>
            <div>
              <label className="etiqueta" htmlFor="estado">Estado</label>
              <Desplegable id="estado" name="estado" defaultValue={f.estado ?? ""}
                opciones={[{ valor: "", etiqueta: "Todos" }, { valor: "abiertas", etiqueta: "Abiertas (todas)" }, ...Object.entries(ESTADOS).map(([v, e]) => ({ valor: v, etiqueta: e.etiqueta }))]} />
            </div>
            <div>
              <label className="etiqueta" htmlFor="pilar">Pilar</label>
              <Desplegable id="pilar" name="pilar" defaultValue={f.pilar ?? ""}
                opciones={[{ valor: "", etiqueta: "Todos" }, ...PILARES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta }))]} />
            </div>
          </>
        )}
        <div className="flex items-end gap-2">
          <button className="btn-primario flex-1">Filtrar</button>
          <Link href={`?vista=${vista}`} className="btn-sec">Limpiar</Link>
        </div>
        {f.mes && f.semana && <p className="text-xs text-suave sm:col-span-full">Con mes y semana a la vez se aplica la semana.</p>}
      </form>

      {vista === "ordenes" ? (
        ordenes.length === 0 ? (
          <Vacio titulo="Sin registros para estos filtros" />
        ) : (
          <div className="caja-panel overflow-x-auto">
            <table className="w-full min-w-[900px] text-[15px]">
              <thead className="text-left text-sm text-suave">
                <tr>
                  <th className="px-5 pb-2 pt-4 font-medium">Folio</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Activo / línea</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Falla (componente · causa)</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Ingreso</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Cierre</th>
                  <th className="px-5 pb-2 pt-4 text-right font-medium">Paro</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id_orden} className="odd:bg-papel/60">
                    <td className="px-5 py-3"><span className="folio">{o.folio_ticket}</span></td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{o.nombre_equipo ?? o.nombre_linea}</p>
                      <p className="text-xs text-suave">{etiquetaPilar(o.pilar)}{o.nombre_almacen ? ` · ${o.nombre_almacen}` : ""}</p>
                    </td>
                    <td className="px-5 py-3">{[o.nombre_modo, o.nombre_origen].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{fechaHora(o.fecha_ingreso, tenant.zona_horaria)}</td>
                    <td className="px-5 py-3 tabular-nums">{fechaHora(o.fecha_cierre, tenant.zona_horaria)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{horas(o.horas_transcurridas)}</td>
                    <td className="px-5 py-3"><ChipEstado e={o.estatus_orden} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : eventos.length === 0 ? (
        <Vacio titulo="Sin movimientos para estos filtros" />
      ) : (
        <ol className="caja-panel divide-y divide-papel">
          {eventos.map((ev) => {
            const d = (ev.datos_despues ?? ev.datos_antes ?? {}) as Record<string, string>;
            return (
              <li key={ev.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-40 shrink-0 tabular-nums text-xs text-suave">{fechaHora(ev.fecha, tenant.zona_horaria)}</span>
                <span className="chip bg-papel">{ACCIONES[ev.accion] ?? ev.accion}</span>
                <span className="font-medium">
                  {ev.tabla === "ordenes_mantenimiento" ? <>Orden <span className="folio">{d.folio_ticket}</span></>
                    : ev.accion === "importacion" ? <>{d.equipos_nuevos} equipos nuevos, {d.equipos_actualizados} actualizados, {d.asignaciones_nuevas} asignaciones a planes</>
                    : <>Equipo {d.nombre_equipo}</>}
                </span>
                <span className="text-xs text-suave">{ev.usuario_id ? nombreDe.get(ev.usuario_id) ?? "Usuario" : "Sistema"}</span>
              </li>
            );
          })}
        </ol>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-suave">{total} registros · página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            {pagina > 1 && <Link className="btn-sec" href={qs({ p: String(pagina - 1) })}>Anterior</Link>}
            {pagina < paginas && <Link className="btn-sec" href={qs({ p: String(pagina + 1) })}>Siguiente</Link>}
          </div>
        </div>
      )}
      {perfil.rol === "lector" && <p className="mt-6 text-xs text-suave">Acceso de solo lectura.</p>}
    </>
  );
}
