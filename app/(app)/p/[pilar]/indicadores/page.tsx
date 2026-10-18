import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { esUuid, rangoPeriodo } from "@/lib/filtros";
import { infoPilar } from "@/lib/catalogos";
import { horas, pct } from "@/lib/formato";
import { Encabezado, Kpi, Seccion, Vacio, ChipEstado } from "@/components/ui";
import { BarraFiltros } from "@/components/BarraFiltros";
import { IconoLlave, IconoNave, IconoPulso, IconoReloj } from "@/components/Iconos";
import type { Indicadores, OrdenDetalle } from "@/lib/tipos";

export const metadata = { title: "Indicadores" };

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-MX", { maximumFractionDigits: 1 }));

export default async function PaginaIndicadores({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ linea?: string; equipo?: string; periodo?: string }>;
}) {
  const { pilar: p } = await params;
  const { pilar } = await sesionDePilar(p);
  const f = await searchParams;
  const { periodo, desde } = rangoPeriodo(f.periodo);
  const linea = esUuid(f.linea) ? f.linea : null;
  const equipo = esUuid(f.equipo) ? f.equipo : null;
  const info = infoPilar(pilar);

  const supabase = await createClient();
  const cat = await catalogosPilar(pilar);
  let detenidos = supabase.from("v_ordenes_detalle").select("*").eq("pilar", pilar)
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"]).order("fecha_ingreso");
  if (linea) detenidos = detenidos.eq("id_linea", linea);
  if (equipo) detenidos = detenidos.eq("id_equipo", equipo);
  const [{ data: ind }, { data: abiertas }] = await Promise.all([
    supabase.rpc("indicadores", { p_pilar: pilar, p_id_linea: linea, p_id_equipo: equipo, p_desde: desde, p_hasta: null }).single(),
    detenidos,
  ]);
  const i = ind as Indicadores | null;
  const lista = (abiertas ?? []) as OrdenDetalle[];

  const nombreLinea = cat.lineas.find((l) => l.id_linea === linea)?.nombre_linea;
  const nombreEquipo = cat.equipos.find((e) => e.id_equipo === equipo)?.nombre_equipo;
  const alcance = nombreEquipo ?? nombreLinea ?? (pilar === "dorsales" ? "Todas las líneas" : `Todos los equipos de ${info.etiqueta}`);

  const mttrOk = i?.mttr_horas != null && i.meta_mttr_horas != null ? i.mttr_horas <= i.meta_mttr_horas : null;
  const disp = i?.disponibilidad_pct ?? null;
  const metaDisp = i?.meta_disponibilidad_pct ?? null;
  const dispTono = disp === null || metaDisp === null ? null : disp >= metaDisp ? "ok" : disp >= metaDisp - 10 ? "alerta" : "paro";
  const mtbfOk = i?.mtbf_horas != null && i.meta_mtbf_horas != null ? i.mtbf_horas >= i.meta_mtbf_horas : null;

  return (
    <>
      <Encabezado

        titulo="Indicadores"
        sub="MTTR, MTBF, disponibilidad y equipos actualmente detenidos."
      />
      <BarraFiltros
        resumen={`${alcance} · ${periodo.t}`}
        lineas={pilar === "dorsales" ? cat.lineas : undefined}
        equipos={cat.equipos}
        valores={{ linea: f.linea, equipo: f.equipo, periodo: f.periodo }}
      />

      <Seccion
        titulo="Indicadores globales"
        sub={i ? `${i.activos_evaluados} ${i.activos_evaluados === 1 ? "activo evaluado" : "activos evaluados"} · ${n1(i.horas_periodo)} h en el periodo` : undefined}
      >
        {!i || i.activos_evaluados === 0 ? (
          <Vacio titulo="Aún no hay activos para medir" accion={<Link href={`/p/${pilar}/equipos`} className="btn-primario">Dar de alta equipos</Link>}>
            Los indicadores se calculan sobre los equipos{pilar === "dorsales" ? " o líneas" : ""} registrados en este pilar.
          </Vacio>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icono={<IconoReloj />}
              etiqueta="MTTR"
              valor={horas(i.mttr_horas)}
              insignia={mttrOk === null ? undefined : mttrOk
                ? { texto: `Dentro de meta (${n1(i.meta_mttr_horas)} h)`, tono: "ok" }
                : { texto: `Arriba de meta (${n1(i.meta_mttr_horas)} h)`, tono: "paro" }}
              pie={`${n1(i.horas_paro_cerradas)} h paradas / ${i.cerradas} reparaciones cerradas`}
              info="Tiempo medio de reparación: horas de paro de las órdenes cerradas ÷ número de órdenes cerradas."
            />
            <Kpi
              icono={<IconoPulso />}
              etiqueta="MTBF"
              valor={horas(i.mtbf_horas)}
              insignia={mtbfOk === null ? undefined : mtbfOk
                ? { texto: "Dentro de meta", tono: "ok" }
                : { texto: "Debajo de meta", tono: "paro" }}
              pie={`${n1(i.horas_operativas)} h operativas / ${i.ingresos} ingresos`}
              info="Tiempo medio entre fallas: horas operativas del periodo ÷ número de ingresos (fallas)."
            />
            <Kpi
              icono={<IconoNave />}
              etiqueta="Disponibilidad"
              valor={pct(disp)}
              insignia={dispTono === null ? undefined : {
                texto: dispTono === "ok" ? `Dentro de meta (${n1(metaDisp)}%)` : dispTono === "alerta" ? "En observación" : "Crítico",
                tono: dispTono,
              }}
              pie={`Base − paro real: ${n1(i.horas_base)} h − ${n1(i.horas_paro)} h`}
              info="Horas base (activos × horas del periodo) menos horas de paro real, entre horas base."
            />
            <Kpi
              icono={<IconoLlave />}
              etiqueta="En paro"
              valor={i.en_paro}
              tono={i.en_paro > 0 ? "paro" : "normal"}
              pie="Órdenes abiertas: pendientes, asignadas o en proceso"
            />
          </div>
        )}
      </Seccion>

      <Seccion
        titulo={pilar === "dorsales" ? "Dorsales actualmente detenidos" : "Equipos actualmente detenidos"}
        sub="Abiertas = detenidos ahora; cerradas = métricas históricas e indicadores."
      >
        {lista.length === 0 ? (
          <Vacio titulo="Nada detenido con este filtro">Cambia la línea, el equipo o el periodo para ampliar la búsqueda.</Vacio>
        ) : (
          <div className="caja-panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-[15px]">
              <thead className="text-left text-sm text-suave">
                <tr>
                  <th className="px-5 pb-2 pt-4 font-medium">Folio</th>
                  <th className="px-5 pb-2 pt-4 font-medium">{pilar === "dorsales" ? "Línea / equipo" : "Equipo"}</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Estado</th>
                  <th className="px-5 pb-2 pt-4 font-medium">Asignada a</th>
                  <th className="px-5 pb-2 pt-4 text-right font-medium">Tiempo abierta</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id_orden} className="odd:bg-papel/60">
                    <td className="px-5 py-3"><Link className="folio hover:underline" href={`/p/${pilar}/ordenes?orden=${o.id_orden}`}>{o.folio_ticket}</Link></td>
                    <td className="px-5 py-3">
                      <span className="font-medium">{pilar === "dorsales" ? o.nombre_linea : o.nombre_equipo}</span>
                      {pilar === "dorsales" && o.nombre_equipo && <span className="text-suave"> · {o.nombre_equipo}</span>}
                    </td>
                    <td className="px-5 py-3"><ChipEstado e={o.estatus_orden} /></td>
                    <td className="px-5 py-3 text-suave">{o.nombre_asignado ?? "Sin asignar"}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{horas(o.horas_transcurridas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </>
  );
}
