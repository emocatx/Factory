import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { esUuid, ordenesDelAlmacen, PERIODO_DEFECTO, rangoPeriodo } from "@/lib/filtros";
import { infoPilar } from "@/lib/catalogos";
import { fechaHora, horas } from "@/lib/formato";
import { Encabezado, Seccion, Segmentado, Vacio } from "@/components/ui";
import { BarraFiltros } from "@/components/BarraFiltros";
import {
  calidad, ETIQUETA_CUADRANTE, malosActores, matriz, pareto, reincidencia,
  type Cuadrante, type FilaFalla, type Metrica, type PuntoActor,
} from "@/lib/analisis";

export const metadata = { title: "Análisis de falla" };

const COLOR_CUADRANTE: Record<Cuadrante, { punto: string; chip: string }> = {
  agudo_cronico: { punto: "var(--color-paro)", chip: "bg-paro-suave text-paro-texto" },
  cronico: { punto: "var(--color-alerta)", chip: "bg-alerta-suave text-alerta-texto" },
  agudo: { punto: "var(--color-azul)", chip: "bg-info-suave text-info-texto" },
  control: { punto: "var(--color-placeholder)", chip: "bg-panel-2 text-suave" },
};

type Filtros = { linea?: string; periodo?: string; metrica?: string; cruce?: string; almacen?: string; equipo?: string };

export default async function Analisis({ params, searchParams }: { params: Promise<{ pilar: string }>; searchParams: Promise<Filtros> }) {
  const { pilar: p } = await params;
  const { pilar, tenant } = await sesionDePilar(p);
  const f = await searchParams;
  const { periodo, desde } = rangoPeriodo(f.periodo);
  const linea = esUuid(f.linea) ? f.linea : null;
  const almacen = esUuid(f.almacen) ? f.almacen : null;
  const equipo = esUuid(f.equipo) ? f.equipo : null;
  const metrica: Metrica = f.metrica === "fallas" ? "fallas" : "horas";
  const cruce = f.cruce === "causa" ? "causa" : "modo";
  const porLinea = pilar === "dorsales" && !linea;
  const info = infoPilar(pilar);
  const unidad = porLinea ? "línea" : "equipo";

  const supabase = await createClient();
  // Se trae 30 días antes del periodo para poder medir reincidencia desde el primer día.
  const desdeHist = desde ? new Date(new Date(desde).getTime() - 30 * 86400e3).toISOString() : null;
  let q = supabase
    .from("v_ordenes_detalle")
    .select("id_orden, id_equipo, id_almacen, nombre_equipo, sap_id, serie, id_linea, nombre_linea, id_origen, nombre_origen, id_modo, nombre_modo, estatus_orden, fecha_ingreso, fecha_cierre, tiempo_paro_horas, horas_transcurridas")
    .eq("pilar", pilar)
    .neq("estatus_orden", "cancelada")
    .order("fecha_ingreso", { ascending: true })
    .limit(10000);
  if (desdeHist) q = q.gte("fecha_ingreso", desdeHist);
  if (linea) q = q.eq("id_linea", linea);
  if (equipo) q = q.eq("id_equipo", equipo);
  const cat = await catalogosPilar(pilar);
  if (almacen) q = q.or(ordenesDelAlmacen(almacen, cat.equipos));
  const { data } = await q;
  const conEquipos = new Set(cat.equipos.map((e) => e.id_almacen));
  const almacenes = cat.almacenes.filter((a) => conEquipos.has(a.id_almacen));
  const historial = (data ?? []) as FilaFalla[];
  const tDesde = desde ? new Date(desde).getTime() : null;
  const filas = tDesde ? historial.filter((x) => new Date(x.fecha_ingreso).getTime() >= tDesde) : historial;

  const alcance = [
    cat.lineas.find((l) => l.id_linea === linea)?.nombre_linea,
    almacenes.find((a) => a.id_almacen === almacen)?.nombre_almacen,
    equipo ? cat.equipos.find((e) => e.id_equipo === equipo)?.nombre_equipo ?? "Un equipo" : null,
  ].filter(Boolean).join(" · ") || (pilar === "dorsales" ? "Todas las líneas" : info.etiqueta);
  const qs = (extra: Partial<Filtros>) =>
    "?" + new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  if (filas.length === 0) {
    return (
      <>
        <Encabezado titulo="Análisis de falla" sub={`${alcance} · ${periodo.t}`}>
          <BarraFiltros enEncabezado lineas={pilar === "dorsales" ? cat.lineas : undefined} almacenes={pilar === "dorsales" ? undefined : almacenes}
            valores={{ linea: f.linea, almacen: f.almacen, equipo: f.equipo, periodo: f.periodo ?? PERIODO_DEFECTO }} />
        </Encabezado>
        <Vacio titulo="Todavía no hay fallas en este periodo">
          El análisis aparece en cuanto se registren órdenes. <Link href={`/p/${pilar}/registro`} className="enlace">Registrar una ›</Link>
        </Vacio>
      </>
    );
  }

  const par = pareto(filas, porLinea, metrica);
  const corte80 = par.findIndex((x) => x.acumulado >= 80);
  const visibles = par.slice(0, Math.max(10, corte80 + 1)).slice(0, 15);
  const maxValor = Math.max(1, ...visibles.map((x) => x.valor));
  const totalValor = par.reduce((s, x) => s + x.valor, 0);
  const actores = malosActores(filas, porLinea);
  const mx = matriz(filas, porLinea, cruce);
  const rein = reincidencia(historial, desde, porLinea);
  const cal = calidad(filas, porLinea);
  const n80 = corte80 + 1;

  return (
    <>
      <Encabezado titulo="Análisis de falla" sub={`${alcance} · ${periodo.t} · ${filas.length} fallas`}>
        <BarraFiltros
          enEncabezado
          lineas={pilar === "dorsales" ? cat.lineas : undefined}
          almacenes={pilar === "dorsales" ? undefined : almacenes}
          valores={{ linea: f.linea, almacen: f.almacen, equipo: f.equipo, periodo: f.periodo ?? PERIODO_DEFECTO }}
        />
      </Encabezado>

      {(cal.sinModo > 0 || cal.sinCausa > 0 || cal.sinUnidad > 0 || cal.abiertas > 0) && (
        <p className="entrar mb-2 rounded-[18px] bg-panel px-5 py-4 text-[15px] text-suave">
          <strong className="font-semibold text-tinta">Calidad del dato.</strong>{" "}
          {[
            cal.abiertas > 0 && `${cal.abiertas} siguen abiertas (cuentan su paro hasta ahora, sin clasificar)`,
            cal.sinModo > 0 && `${cal.sinModo} cerradas sin componente`,
            cal.sinCausa > 0 && `${cal.sinCausa} sin causa`,
            cal.sinUnidad > 0 && `${cal.sinUnidad} sin ${unidad} identificado`,
          ].filter(Boolean).join(" · ")}.
        </p>
      )}

      {/* 1 · Pareto */}
      <Seccion
        titulo={`Dónde se concentra el ${metrica === "horas" ? "paro" : "número de fallas"}`}
        sub={corte80 >= 0 && par.length > 1
          ? `${n80} de ${par.length} ${unidad === "línea" ? "líneas" : "equipos"} suman el 80 % ${metrica === "horas" ? `de las ${horas(totalValor)} de paro` : `de las ${totalValor} fallas`}.`
          : undefined}
        extra={
          <Segmentado
            etiqueta="Ordenar por"
            opciones={[{ v: "horas", t: "Horas de paro", href: qs({ metrica: "" }) }, { v: "fallas", t: "Frecuencia", href: qs({ metrica: "fallas" }) }]}
            actual={metrica}
          />
        }
      >
        <div className="caja-panel p-5 md:p-6">
          <ol className="space-y-1">
            {visibles.map((x, i) => (
              <li key={x.clave}>
                <div className={`grid items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_170px] ${i > corte80 ? "opacity-55" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{x.nombre}</p>
                    <p className="text-[13px] text-suave">{[x.detalle, metrica === "horas" ? `${x.fallas} falla${x.fallas === 1 ? "" : "s"}` : horas(x.horas)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-papel" aria-hidden="true">
                    <div className="h-full rounded-full bg-tinta" style={{ width: `${(100 * x.valor) / maxValor}%` }} />
                  </div>
                  <p className="text-[15px] tabular-nums sm:text-right">
                    <strong className="font-semibold">{metrica === "horas" ? horas(x.valor) : x.valor}</strong>
                    <span className="text-suave"> · acum. {x.acumulado.toFixed(0)} %</span>
                  </p>
                </div>
                {i === corte80 && i < visibles.length - 1 && (
                  <div className="my-2 flex items-center gap-3 text-[13px] font-medium text-nuevo">
                    <span className="h-px flex-1 bg-[color:var(--color-nuevo)]/40" />80 % {metrica === "horas" ? "del paro" : "de las fallas"} hasta aquí<span className="h-px flex-1 bg-[color:var(--color-nuevo)]/40" />
                  </div>
                )}
              </li>
            ))}
          </ol>
          {par.length > visibles.length && <p className="mt-4 text-[13px] text-suave">Y {par.length - visibles.length} más con el resto del {metrica === "horas" ? "paro" : "conteo"}.</p>}
        </div>
      </Seccion>

      {/* 2 · Malos actores */}
      <Seccion
        titulo="Matriz de malos actores"
        sub={`Frecuencia contra tiempo medio de reparación. Las líneas punteadas son el promedio: ${actores.limFallas.toFixed(1)} fallas y ${horas(actores.limMttr)} por reparación.`}
      >
        {actores.puntos.length < 2 ? (
          <Vacio titulo="Se necesitan al menos dos con órdenes cerradas">La matriz compara contra el promedio, así que requiere más de un {unidad}.</Vacio>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="caja-panel p-4 md:p-6"><Dispersion puntos={actores.puntos} limX={actores.limFallas} limY={actores.limMttr} /></div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {(["agudo_cronico", "cronico", "agudo", "control"] as Cuadrante[]).map((c) => {
                const lista = actores.puntos.filter((x) => x.cuadrante === c);
                return (
                  <li key={c} className="caja-panel p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`chip ${COLOR_CUADRANTE[c].chip}`}>{ETIQUETA_CUADRANTE[c].titulo}</span>
                      <span className="text-[13px] text-suave">{lista.length}</span>
                    </div>
                    <p className="mt-2 text-[14px] text-suave">{ETIQUETA_CUADRANTE[c].accion}</p>
                    {lista.length > 0 && (
                      <p className="mt-2 text-[15px] font-medium">{lista.slice(0, 4).map((x) => x.nombre).join(", ")}{lista.length > 4 ? ` y ${lista.length - 4} más` : ""}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Seccion>

      {/* 3 · Cruce */}
      <Seccion
        titulo={`${porLinea ? "Línea" : "Equipo"} × ${cruce === "modo" ? "componente" : "causa"}`}
        sub={cruce === "modo" ? "Qué parte falla en cada uno. Solo órdenes cerradas." : "Por qué falla cada uno, para decidir capacitación, preventivo o rediseño."}
        extra={
          <Segmentado
            etiqueta="Cruzar con"
            opciones={[{ v: "modo", t: "Componente", href: qs({ cruce: "" }) }, { v: "causa", t: "Causa", href: qs({ cruce: "causa" }) }]}
            actual={cruce}
          />
        }
      >
        {mx.filas.length === 0 ? (
          <Vacio titulo="Aún no hay órdenes cerradas en el periodo">El cruce se llena al concluir órdenes con componente y causa.</Vacio>
        ) : (
          <div className="caja-panel overflow-x-auto p-2 md:p-4">
            <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-[14px]">
              <thead>
                <tr>
                  <th className="w-56 px-2 text-left font-medium text-suave"><span className="sr-only">{porLinea ? "Línea" : "Equipo"}</span></th>
                  {mx.columnas.map((c) => <th key={c.clave} className="px-2 pb-1 text-center align-bottom font-medium text-suave">{c.nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {mx.filas.map((u, i) => (
                  <tr key={u.clave}>
                    <th scope="row" className="truncate px-2 text-left font-medium">{u.nombre}</th>
                    {mx.columnas.map((c, j) => {
                      const v = mx.celdas[i][j];
                      const a = v ? 0.12 + 0.88 * (v / mx.max) : 0;
                      return (
                        <td key={c.clave} className="h-11 rounded-[10px] text-center tabular-nums"
                          style={{ background: v ? `color-mix(in srgb, var(--color-azul) ${Math.round(a * 100)}%, transparent)` : "var(--color-papel)", color: a > 0.55 ? "var(--color-sobre-azul)" : v ? "var(--color-tinta)" : "var(--color-placeholder)", fontWeight: v ? 600 : 400 }}>
                          {v || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {/* 4 · Reincidencia */}
      <Seccion titulo="Reincidencia" sub="Fallas del mismo componente en el mismo equipo dentro de los 30 días posteriores a una reparación.">
        <div className="grid gap-5 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="caja-panel flex flex-col justify-between p-5">
            <p className="text-[13px] text-suave">Fallas repetidas</p>
            <p className={`mt-2 cifra ${rein.pct != null && rein.pct > 15 ? "text-paro-texto" : ""}`}>
              {rein.pct == null ? "—" : `${rein.pct.toFixed(0)} %`}
            </p>
            <p className="mt-3 text-[14px] text-suave">{rein.repetidas} de {rein.base} fallas clasificadas. Arriba de 15 % sugiere reparaciones que no atacan la causa.</p>
          </div>
          <div className="caja-panel p-5">
            {rein.pares.length === 0 ? (
              <p className="text-[15px] text-suave">Sin repeticiones en el periodo.</p>
            ) : (
              <ul className="divide-y divide-papel">
                {rein.pares.map((r) => (
                  <li key={r.clave + r.componente} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                    <span><strong className="font-semibold">{r.nombre}</strong> · {r.componente}</span>
                    <span className="text-[14px] tabular-nums text-suave">{r.veces} repetición{r.veces === 1 ? "" : "es"} · última {fechaHora(r.ultima, tenant.zona_horaria)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Seccion>
    </>
  );
}

/** Dispersión frecuencia × MTTR dibujada a escala, con líneas de promedio y nombres de los de mayor paro. */
function Dispersion({ puntos, limX, limY }: { puntos: PuntoActor[]; limX: number; limY: number }) {
  const W = 640, H = 380, m = { l: 52, r: 20, t: 20, b: 46 };
  const maxX = Math.max(limX * 2, ...puntos.map((x) => x.fallas)) * 1.1;
  const maxY = Math.max(limY * 2, ...puntos.map((x) => x.mttr)) * 1.1;
  const sx = (v: number) => m.l + (v / maxX) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - (v / maxY) * (H - m.t - m.b);
  const ticks = (max: number) => { const paso = Math.max(1, Math.ceil(max / 5)); return Array.from({ length: Math.floor(max / paso) + 1 }, (_, i) => i * paso); };
  const nombrados = new Set(puntos.slice(0, 6).map((x) => x.clave));
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Dispersión de frecuencia de fallas contra tiempo medio de reparación">
        {ticks(maxX).map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} stroke="var(--color-reja)" />
            <text x={sx(t)} y={H - m.b + 18} textAnchor="middle" fontSize="12" fill="var(--color-suave)">{t}</text>
          </g>
        ))}
        {ticks(maxY).map((t) => (
          <g key={`y${t}`}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--color-reja)" />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="12" fill="var(--color-suave)">{t}</text>
          </g>
        ))}
        <line x1={sx(limX)} x2={sx(limX)} y1={m.t} y2={H - m.b} stroke="var(--color-tinta)" strokeDasharray="4 4" strokeOpacity="0.5" />
        <line x1={m.l} x2={W - m.r} y1={sy(limY)} y2={sy(limY)} stroke="var(--color-tinta)" strokeDasharray="4 4" strokeOpacity="0.5" />
        <text x={W - m.r - 6} y={m.t + 14} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--color-paro-texto)">Agudo y crónico</text>
        <text x={W - m.r - 6} y={sy(limY) + 16} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--color-alerta-texto)">Crónico</text>
        <text x={m.l + 6} y={m.t + 14} fontSize="12" fontWeight="600" fill="var(--color-info-texto)">Agudo</text>
        {puntos.map((x) => (
          <g key={x.clave}>
            <circle cx={sx(x.fallas)} cy={sy(x.mttr)} r={7} fill={COLOR_CUADRANTE[x.cuadrante].punto} fillOpacity="0.9" stroke="var(--color-panel)" strokeWidth="2">
              <title>{`${x.nombre}: ${x.fallas} fallas, ${x.mttr.toFixed(1)} h por reparación`}</title>
            </circle>
            {nombrados.has(x.clave) && (
              <text x={sx(x.fallas) > W * 0.7 ? sx(x.fallas) - 11 : sx(x.fallas) + 11} textAnchor={sx(x.fallas) > W * 0.7 ? "end" : "start"} y={sy(x.mttr) + 4} fontSize="12" fill="var(--color-tinta)">{x.nombre.length > 22 ? x.nombre.slice(0, 21) + "…" : x.nombre}</text>
            )}
          </g>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-suave)">Número de fallas →</text>
        <text transform={`translate(14 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--color-suave)">Horas por reparación (MTTR) →</text>
      </svg>
      <table className="sr-only">
        <caption>Malos actores</caption>
        <thead><tr><th>Nombre</th><th>Fallas</th><th>MTTR (h)</th><th>Cuadrante</th></tr></thead>
        <tbody>{puntos.map((x) => <tr key={x.clave}><td>{x.nombre}</td><td>{x.fallas}</td><td>{x.mttr.toFixed(1)}</td><td>{ETIQUETA_CUADRANTE[x.cuadrante].titulo}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
