import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { datosHome } from "@/lib/home";
import { esUuid } from "@/lib/filtros";
import { HomeMoviles } from "@/components/home/HomeMoviles";
import { sesionDePilar } from "@/lib/sesion";
import { todasLasPaginas } from "@/lib/datos";
import { infoPilar } from "@/lib/catalogos";
import { horas, pct } from "@/lib/formato";
import type { OrdenDetalle } from "@/lib/tipos";

export const metadata = { title: "Resumen" };

const PERIODOS = [
  { v: "hoy", t: "Hoy", dias: 0, nombre: "hoy" },
  { v: "7d", t: "7 días", dias: 7, nombre: "7 días" },
  { v: "30d", t: "30 días", dias: 30, nombre: "30 días" },
] as const;
const SEMANAS = 11;
const DIA = 86_400_000;
/** Hora del centro de México (sin horario de verano desde 2022). */
const OFFSET = -6 * 3_600_000;

const abiertas = ["pendiente", "asignada", "en_proceso"] as const;
const dias = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DIA);
const fechaCorta = (t: number) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(t + OFFSET)).replace(".", "");
const num = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

/** Medianoche local (en ms UTC) del día de t; y el lunes de esa semana. */
const medianoche = (t: number) => Math.floor((t + OFFSET) / DIA) * DIA - OFFSET;
const lunes = (t: number) => {
  const m = medianoche(t);
  const dow = (new Date(m + OFFSET).getUTCDay() + 6) % 7; // 0 = lunes
  return m - dow * DIA;
};

type Fila = Pick<OrdenDetalle, "fecha_ingreso" | "tiempo_paro_horas" | "estatus_orden" | "nombre_almacen" | "nombre_linea">;

export default async function Resumen({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ periodo?: string; almacen?: string }>;
}) {
  const { pilar: p } = await params;
  const { pilar, tenant, perfil } = await sesionDePilar(p);
  // Operaciones no tiene Resumen (su espacio es Seguimiento), ni aunque escriba la dirección a mano.
  if (perfil.rol === "operaciones") redirect(`/p/${pilar}/ordenes`);
  const { periodo: pv, almacen } = await searchParams;

  // Móviles: home visual (planta 3D en escritorio, 2D en celular). Los demás pilares siguen con este Resumen.
  if (pilar === "moviles") {
    const datos = await datosHome({
      pilar, periodo: pv, rol: perfil.rol, idUsuario: perfil.id,
      metas: { disponibilidad: tenant.meta_disponibilidad_pct ?? null, mttr: tenant.meta_mttr_horas ?? null, mtbf: tenant.meta_mtbf_horas ?? null },
    });
    return <HomeMoviles datos={datos} base={`/p/${pilar}`} almacenInicial={esUuid(almacen) ? almacen : null} />;
  }
  const periodo = PERIODOS.find((x) => x.v === pv) ?? PERIODOS[2];
  const ahora = Date.now();
  const desde = periodo.dias ? ahora - periodo.dias * DIA : medianoche(ahora);
  const inicioSemanas = lunes(ahora) - (SEMANAS - 1) * 7 * DIA;
  const supabase = await createClient();

  const [{ count: activos }, { data: det }, { data: filas }, { data: rec }] = await Promise.all([
    supabase.from("equipos").select("id_equipo", { count: "exact", head: true }).eq("tipo_pilar", pilar).neq("estatus", "baja"),
    supabase.from("v_ordenes_detalle").select("folio_ticket, fecha_ingreso, descripcion_falla, nombre_equipo, nombre_almacen, nombre_linea")
      .eq("pilar", pilar).in("estatus_orden", abiertas).order("fecha_ingreso", { ascending: true }).limit(1000),
    todasLasPaginas<Fila>((a, b) =>
      supabase.from("v_ordenes_detalle").select("fecha_ingreso, tiempo_paro_horas, estatus_orden, nombre_almacen, nombre_linea")
        .eq("pilar", pilar).neq("estatus_orden", "cancelada").gte("fecha_ingreso", new Date(Math.min(desde, inicioSemanas)).toISOString())
        .order("fecha_ingreso").range(a, b)),
    supabase.from("v_ordenes_detalle").select("id_orden, folio_ticket, fecha_cierre, notas_cierre, nombre_equipo, nombre_almacen, nombre_linea")
      .eq("pilar", pilar).eq("estatus_orden", "cerrada").order("fecha_cierre", { ascending: false }).limit(5),
  ]);

  const detenidos = (det ?? []) as Pick<OrdenDetalle, "folio_ticket" | "fecha_ingreso" | "descripcion_falla" | "nombre_equipo" | "nombre_almacen" | "nombre_linea">[];
  const recientes = (rec ?? []) as Pick<OrdenDetalle, "id_orden" | "folio_ticket" | "fecha_cierre" | "notas_cierre" | "nombre_equipo" | "nombre_almacen" | "nombre_linea">[];
  const nActivos = activos ?? 0;
  const operando = Math.max(0, nActivos - detenidos.length);
  const disponibilidad = nActivos ? (100 * operando) / nActivos : null;
  const meta = Number(tenant.meta_disponibilidad_pct ?? 95);
  const masDe100 = detenidos.filter((o) => dias(o.fecha_ingreso) > 100).length;

  // Fallas del periodo = ingresos del periodo; sus horas de paro y la mediana de las ya cerradas.
  const delPeriodo = filas.filter((o) => new Date(o.fecha_ingreso).getTime() >= desde);
  const horasParo = delPeriodo.reduce((s, o) => s + Number(o.tiempo_paro_horas ?? 0), 0);
  const reparaciones = delPeriodo.filter((o) => o.estatus_orden === "cerrada" && o.tiempo_paro_horas !== null)
    .map((o) => Number(o.tiempo_paro_horas)).sort((a, b) => a - b);
  const mediana = reparaciones.length
    ? (reparaciones[(reparaciones.length - 1) >> 1] + reparaciones[reparaciones.length >> 1]) / 2
    : null;
  const promedio = reparaciones.length ? reparaciones.reduce((s, x) => s + x, 0) / reparaciones.length : null;

  // Mini gráfica de la tarjeta: el periodo partido en 7 tramos.
  const tramos = Array.from({ length: 7 }, () => 0);
  for (const o of delPeriodo) {
    const i = Math.min(6, Math.floor((7 * (new Date(o.fecha_ingreso).getTime() - desde)) / Math.max(1, ahora - desde)));
    tramos[i]++;
  }
  const maxTramo = Math.max(1, ...tramos);

  const porAlmacen = new Map<string, { fallas: number; horas: number }>();
  for (const o of delPeriodo) {
    const k = o.nombre_almacen ?? o.nombre_linea ?? "Sin almacén";
    const x = porAlmacen.get(k) ?? { fallas: 0, horas: 0 };
    x.fallas++;
    x.horas += Number(o.tiempo_paro_horas ?? 0);
    porAlmacen.set(k, x);
  }
  const topAlmacenes = [...porAlmacen].sort((a, b) => b[1].fallas - a[1].fallas || b[1].horas - a[1].horas).slice(0, 6);
  const maxAlmacen = Math.max(1, ...topAlmacenes.map(([, x]) => x.fallas));

  const semanas = Array.from({ length: SEMANAS }, (_, i) => ({ inicio: inicioSemanas + i * 7 * DIA, n: 0 }));
  for (const o of filas) {
    const i = Math.floor((new Date(o.fecha_ingreso).getTime() - inicioSemanas) / (7 * DIA));
    if (i >= 0 && i < SEMANAS) semanas[i].n++;
  }
  const maxSemana = Math.max(1, ...semanas.map((s) => s.n));

  return (
    <>
      <header className="entrar flex flex-wrap items-start justify-between gap-4 pb-6">
        <div>
          <h1 className="text-[32px] font-semibold leading-[1.1] md:text-[40px]">Resumen de {infoPilar(pilar).etiqueta}</h1>
          <p className="mt-2 text-[17px] text-suave">{num(nActivos)} equipos activos · se actualiza solo cuando alguien registra o libera</p>
        </div>
        <nav aria-label="Periodo" className="inline-flex rounded-full bg-panel-2 p-1">
          {PERIODOS.map((x) => (
            <Link key={x.v} href={x.v === "30d" ? "?" : `?periodo=${x.v}`} scroll={false} aria-current={x.v === periodo.v ? "true" : undefined}
              className={`flex min-h-10 items-center rounded-full px-4 text-[15px] ${x.v === periodo.v ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>
              {x.t}
            </Link>
          ))}
        </nav>
      </header>

      <div className="entrar entrar-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Disponibilidad de flota">
          <p className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{pct(disponibilidad)}</p>
          <div className="relative mt-4 h-1.5 rounded-full bg-papel" role="presentation">
            <div className="h-full rounded-full bg-ok" style={{ width: `${disponibilidad ?? 0}%` }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-tinta/40" style={{ left: `${meta}%` }} title={`Meta ${meta}%`} />
          </div>
          <p className="mt-2 text-[13px] text-suave">{num(operando)} de {num(nActivos)} equipos operando · meta {meta}%</p>
        </Tarjeta>

        <Tarjeta titulo="Detenidos ahora">
          <p className={`text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${detenidos.length ? "text-paro-texto" : ""}`}>{detenidos.length}</p>
          {masDe100 > 0 && <p className="mt-3 text-[13px] text-paro-texto">{masDe100 === 1 ? "1 lleva" : `${masDe100} llevan`} más de 100 días detenido{masDe100 === 1 ? "" : "s"}</p>}
          <Link href={`/p/${pilar}/ordenes`} className="enlace mt-1 text-[13px]">Ver detenidos ›</Link>
        </Tarjeta>

        <Tarjeta titulo={`Fallas · ${periodo.nombre}`}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{num(delPeriodo.length)}</p>
            <div className="flex h-10 items-end gap-1" aria-hidden="true">
              {tramos.map((n, i) => (
                <span key={i} className="w-1.5 rounded-sm bg-azul" style={{ height: `${Math.max(8, (100 * n) / maxTramo)}%` }} />
              ))}
            </div>
          </div>
          <p className="mt-3 text-[13px] text-suave">{num(horasParo)} h de paro acumuladas</p>
        </Tarjeta>

        <Tarjeta titulo="Reparación típica (mediana)">
          <p className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{horas(mediana)}</p>
          <p className="mt-3 text-[13px] text-suave">
            {promedio === null ? "Sin reparaciones cerradas en el periodo"
              : `Promedio ${horas(promedio)}${mediana !== null && promedio > 3 * Math.max(mediana, 0.1) ? ": lo inflan pocos paros largos" : ""}`}
          </p>
        </Tarjeta>
      </div>

      <div className="entrar entrar-3 mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="caja-panel p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-[19px] font-semibold">Detenidos más antiguos</h2>
            {detenidos.length > 0 && <Link href={`/p/${pilar}/ordenes`} className="enlace text-[14px]">Ver los {detenidos.length} ›</Link>}
          </div>
          {detenidos.length === 0 ? (
            <p className="py-8 text-center text-suave">No hay equipos detenidos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead className="text-left text-[13px] text-suave">
                  <tr>
                    <th className="pb-2 font-medium">Folio</th>
                    <th className="pb-2 font-medium">Equipo</th>
                    <th className="pb-2 font-medium">Almacén</th>
                    <th className="pb-2 font-medium">Falla</th>
                    <th className="pb-2 text-right font-medium">Detenido</th>
                  </tr>
                </thead>
                <tbody>
                  {detenidos.slice(0, 8).map((o) => {
                    const d = dias(o.fecha_ingreso);
                    return (
                      <tr key={o.folio_ticket} className="border-t border-papel">
                        <td className="folio py-2.5 pr-3 text-[13px]">{o.folio_ticket}</td>
                        <td className="max-w-[200px] truncate py-2.5 pr-3 font-medium">{o.nombre_equipo ?? "—"}</td>
                        <td className="py-2.5 pr-3 text-suave">{o.nombre_almacen ?? o.nombre_linea ?? "—"}</td>
                        <td className="max-w-[240px] truncate py-2.5 pr-3" title={o.descripcion_falla}>{o.descripcion_falla}</td>
                        <td className={`py-2.5 text-right font-semibold tabular-nums ${d >= 30 ? "text-paro-texto" : d >= 7 ? "text-alerta-texto" : ""}`}>
                          {d === 0 ? "Hoy" : `${d} día${d === 1 ? "" : "s"}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {masDe100 > 0 && <p className="mt-4 text-[13px] text-suave">Varios vienen del historial importado. Revisa si siguen detenidos o si faltó registrar su salida.</p>}
        </section>

        <section className="caja-panel p-6">
          <h2 className="text-[19px] font-semibold">Almacenes con más fallas</h2>
          <p className="mt-0.5 text-[13px] text-suave">{periodo.dias ? `Últimos ${periodo.nombre}` : "Hoy"} · fallas y horas de paro</p>
          {topAlmacenes.length === 0 ? (
            <p className="py-8 text-center text-suave">Sin fallas en el periodo.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {topAlmacenes.map(([nombre, x]) => (
                <li key={nombre}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="truncate font-semibold">{nombre}</span>
                    <span className="shrink-0 text-[13px] text-suave tabular-nums">{x.fallas} falla{x.fallas === 1 ? "" : "s"} · {num(x.horas)} h</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-papel" role="presentation">
                    <div className="h-full rounded-full bg-azul" style={{ width: `${(100 * x.fallas) / maxAlmacen}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="entrar entrar-4 mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="caja-panel p-6">
          <h2 className="text-[19px] font-semibold">Fallas por semana</h2>
          <p className="mt-0.5 text-[13px] text-suave">{infoPilar(pilar).etiqueta} · últimas {SEMANAS} semanas (la última va en curso)</p>
          <div className="mt-6 flex h-48 items-end gap-2 border-b border-papel sm:gap-3">
            {semanas.map((s, i) => (
              <div key={s.inicio} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[12px] tabular-nums">{s.n}</span>
                <div className={`w-full max-w-10 rounded-t-md ${i === SEMANAS - 1 ? "bg-azul/40" : "bg-azul"}`} style={{ height: `${(100 * s.n) / maxSemana}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 sm:gap-3">
            {semanas.map((s) => (
              <span key={s.inicio} className="flex-1 text-center text-[11px] whitespace-nowrap text-suave">{fechaCorta(s.inicio)}</span>
            ))}
          </div>
        </section>

        <section className="caja-panel p-6">
          <h2 className="text-[19px] font-semibold">Actividad reciente</h2>
          {recientes.length === 0 ? (
            <p className="py-8 text-center text-suave">Aún no se ha liberado ningún equipo.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {recientes.map((o) => (
                <li key={o.id_orden} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok-texto" aria-hidden="true">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>
                  </span>
                  <div className="min-w-0 text-[14px]">
                    <p><span className="font-semibold">Liberado</span> · {o.nombre_equipo ?? o.nombre_linea ?? "Sin equipo"}</p>
                    <p className="truncate text-[12px] text-suave">{[o.folio_ticket, o.nombre_almacen, o.notas_cierre].filter(Boolean).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="caja-panel p-6">
      <p className="mb-2 text-[13px] text-suave">{titulo}</p>
      {children}
    </div>
  );
}
