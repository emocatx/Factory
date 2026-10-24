import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar, todasLasPaginas } from "@/lib/datos";
import { esUuid } from "@/lib/filtros";
import { infoPilar, puedeAsignar } from "@/lib/catalogos";
import { aDia, etiquetaTipo, familia, frecuencia, hoyMx, nTareas, ocurrencias, sumarDias, temaDominante } from "@/lib/planes";
import { Encabezado, Seccion } from "@/components/ui";
import { ImportarPlan } from "@/components/importar/ImportarPlan";
import { PanelPlanes } from "./PanelPlanes";
import { BotonHecho, SelectorAlmacen } from "./Controles";
import { importarPlan } from "./acciones";
import type { PlanEquipo, PlanMantenimiento } from "@/lib/tipos";

export const metadata = { title: "Planes de mantenimiento" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const diaSemana = (iso: string) => (new Date(aDia(iso)).getUTCDay() + 6) % 7; // 0 = lunes
const corta = (iso: string) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1].slice(0, 3)}`;

type Entrada = { fecha: string; plan: string; tipo: PlanEquipo["tipo"]; ids: string[]; nombres: string[]; vencido: boolean };

export default async function Planes({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ almacen?: string; vista?: string; mes?: string; nuevo?: string }>;
}) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  const f = await searchParams;
  const almacen = esUuid(f.almacen) ? f.almacen : "";
  const vista = f.vista === "calendario" ? "calendario" : "planes";
  const editar = puedeAsignar(perfil.rol);
  const supabase = await createClient();
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  let fallasQ = supabase.from("v_ordenes_detalle").select("descripcion_falla, nombre_modo, nombre_equipo")
    .eq("pilar", pilar).neq("estatus_orden", "cancelada").gte("fecha_ingreso", hace30).limit(2000);
  if (almacen) fallasQ = fallasQ.eq("id_almacen", almacen);
  const [{ data: planesData }, { data: todas }, cat, { data: fallas }] = await Promise.all([
    supabase.from("planes_mantenimiento").select("id_plan, pilar, nombre, tipo, cada_dias, tareas, activo").eq("pilar", pilar).order("nombre"),
    todasLasPaginas<PlanEquipo>((d, h) => supabase.from("v_plan_equipos").select("*").eq("pilar", pilar).order("proximo").order("id").range(d, h)),
    catalogosPilar(pilar),
    fallasQ,
  ]);
  const planes = (planesData ?? []) as PlanMantenimiento[];

  // Alcance: un almacén o todo el pilar.
  const equipos = almacen ? cat.equipos.filter((e) => e.id_almacen === almacen) : cat.equipos;
  const asig = almacen ? todas.filter((a) => a.id_almacen === almacen) : todas;
  const nombreAlcance = cat.almacenes.find((a) => a.id_almacen === almacen)?.nombre_almacen ?? infoPilar(pilar).etiqueta;
  const porAlmacen = new Map<string, number>();
  for (const e of cat.equipos) porAlmacen.set(e.id_almacen, (porAlmacen.get(e.id_almacen) ?? 0) + 1);
  const opcionesAlmacen = [
    { valor: "", etiqueta: `Todos · ${cat.equipos.length} equipos` },
    ...cat.almacenes.filter((a) => porAlmacen.has(a.id_almacen)).map((a) => ({ valor: a.id_almacen, etiqueta: `${a.nombre_almacen} · ${porAlmacen.get(a.id_almacen)} equipos` })),
  ];
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams(Object.entries({ almacen, ...extra }).filter(([, v]) => v)).toString();

  const hoy = hoyMx();
  const conFecha = asig.filter((a) => a.dias_restantes !== null);
  const vencidos = conFecha.filter((a) => a.dias_restantes! < 0);
  const proximos = conFecha.filter((a) => a.dias_restantes! >= 0 && a.dias_restantes! <= 7);
  const inicioMes = hoy.slice(0, 8) + "01";
  const realizados = asig.filter((a) => a.ultimo_servicio && a.ultimo_servicio >= inicioMes).length;
  const programados = realizados + vencidos.length;
  const cumplimiento = programados ? Math.round((100 * realizados) / programados) : null;
  const conPlan = new Set(asig.map((a) => a.id_equipo));
  const sinPlan = equipos.filter((e) => !conPlan.has(e.id_equipo)).length;
  const desglose = (xs: PlanEquipo[]) =>
    [...xs.reduce((m, a) => m.set(a.plan, (m.get(a.plan) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
      .slice(0, 2).map(([pl, n]) => `${n} ${pl.toLowerCase()}`).join(" · ");

  const tema = temaDominante((fallas ?? []).map((x) => ({ texto: `${x.nombre_modo ?? ""} ${x.descripcion_falla ?? ""}`, equipo: x.nombre_equipo as string | null })));
  const sugerir = tema && !planes.some((pl) => pl.nombre.toLowerCase().includes(tema.tema.split(" ")[0]));

  // Tabla de planes con alcance: los que tienen equipos aquí, más los nuevos sin asignar.
  const filasPlan = planes.map((pl) => {
    const suyas = asig.filter((a) => a.id_plan === pl.id_plan);
    const conDias = suyas.filter((a) => a.dias_restantes !== null).sort((a, b) => a.dias_restantes! - b.dias_restantes!);
    const alDia = suyas.filter((a) => a.ultimo_servicio && (a.dias_restantes ?? 0) >= 0).length;
    return { pl, suyas, siguiente: conDias[0] ?? null, alDia, global: todas.some((a) => a.id_plan === pl.id_plan) };
  }).filter((x) => x.suyas.length || !x.global);

  // Esta semana: vencidos (hoy, atrasados) y lo que toca en los próximos 7 días, agrupado por día y plan.
  const finSemana = sumarDias(hoy, 6);
  const semana = new Map<string, Entrada>();
  const agregar = (fecha: string, a: PlanEquipo, vencido: boolean) => {
    const k = `${fecha}|${a.id_plan}|${vencido}`;
    const e = semana.get(k) ?? { fecha, plan: a.plan, tipo: a.tipo, ids: [], nombres: [], vencido };
    e.ids.push(a.id); e.nombres.push(a.nombre_equipo);
    semana.set(k, e);
  };
  for (const a of vencidos) agregar(hoy, a, true);
  for (const a of conFecha) for (const d of ocurrencias(a, hoy, finSemana)) agregar(d, a, false);
  const entradas = [...semana.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(b.vencido) - Number(a.vencido));

  return (
    <>
      <Encabezado titulo="Planes de mantenimiento" sub={`Preventivos e inspecciones de ${infoPilar(pilar).etiqueta}, por almacén.`}>
        <SelectorAlmacen valor={almacen} vista={vista} opciones={opcionesAlmacen} />
        <nav aria-label="Vista" className="inline-flex rounded-full bg-panel-2 p-1">
          {([["planes", "Planes"], ["calendario", "Calendario"]] as const).map(([v, t]) => (
            <Link key={v} href={qs(v === "calendario" ? { vista: v } : {})} scroll={false} aria-current={v === vista ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-full px-4 text-[15px] ${v === vista ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>{t}</Link>
          ))}
        </nav>
      </Encabezado>

      {vista === "calendario" ? (
        <Calendario asig={asig} mes={/^\d{4}-\d{2}$/.test(f.mes ?? "") ? f.mes! : hoy.slice(0, 7)} hoy={hoy} qs={qs} alcance={nombreAlcance} />
      ) : (
        <>
          <div className="entrar entrar-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo={`Cumplimiento de ${MESES[+hoy.slice(5, 7) - 1]}`}>
              <p className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{cumplimiento === null ? "—" : `${cumplimiento}%`}</p>
              <div className="mt-4 h-1.5 rounded-full bg-papel" role="presentation"><div className="h-full rounded-full bg-azul" style={{ width: `${cumplimiento ?? 0}%` }} /></div>
              <p className="mt-2 text-[13px] text-suave">{programados ? `${realizados} de ${programados} programados realizados` : "Sin servicios programados este mes"}</p>
            </Tarjeta>
            <Tarjeta titulo="Vencidos">
              <p className={`text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${vencidos.length ? "text-paro-texto" : ""}`}>{vencidos.length}</p>
              <p className={`mt-3 text-[13px] ${vencidos.length ? "text-paro-texto" : "text-suave"}`}>
                {vencidos.length ? `${vencidos.filter((a) => a.dias_restantes! < -7).length} con más de 7 días de atraso` : "Todo al día"}
              </p>
            </Tarjeta>
            <Tarjeta titulo="Próximos 7 días">
              <p className="text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{proximos.length}</p>
              <p className="mt-3 text-[13px] text-suave">{proximos.length ? desglose(proximos) : "Nada programado"}</p>
            </Tarjeta>
            <Tarjeta titulo="Equipos sin plan">
              <p className={`text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${sinPlan ? "text-alerta-texto" : ""}`}>{sinPlan}</p>
              <p className="mt-3 text-[13px] text-suave">{sinPlan ? `De ${equipos.length} equipos${editar ? ": asígnales un plan abajo" : ""}` : "Todos tienen plan"}</p>
            </Tarjeta>
          </div>

          {sugerir && (
            <div className="entrar entrar-3 mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-caja bg-info-suave px-6 py-4 text-[15px] text-info-texto">
              <p className="min-w-0 flex-1">
                <strong className="font-semibold">Sugerido desde el análisis de falla:</strong>{" "}
                en {nombreAlcance} {tema.n} de sus {tema.total} fallas de los últimos 30 días son de {tema.tema}{tema.en ? ` en ${tema.en}` : ""}.
                Una inspección semanal de {tema.tema} podría cambiarlas de correctivo a preventivo.
              </p>
              {editar && <Link href={`${qs({ nuevo: `Inspección de ${tema.tema}` })}#nuevo-plan`} className="font-semibold hover:underline">Crear plan ›</Link>}
            </div>
          )}

          <div className="entrar entrar-3 mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="caja-panel overflow-x-auto">
              {filasPlan.length === 0 ? (
                <p className="px-6 py-12 text-center text-suave">Aún no hay planes{almacen ? " en este almacén" : ""}. {editar ? "Créalos o cárgalos desde Excel abajo." : ""}</p>
              ) : (
                <table className="w-full min-w-[720px] text-[14px]">
                  <thead className="text-left text-[13px] text-suave">
                    <tr>{["Plan", "Frecuencia", "Equipos", "Próxima", "Avance del ciclo"].map((t) => <th key={t} className="px-5 pb-2 pt-4 font-medium">{t}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filasPlan.map(({ pl, suyas, siguiente, alDia }) => {
                      const pct = suyas.length ? Math.round((100 * alDia) / suyas.length) : 0;
                      const d = siguiente?.dias_restantes ?? null;
                      return (
                        <tr key={pl.id_plan} className="border-t border-papel">
                          <td className="px-5 py-3">
                            <p className="font-semibold">{pl.nombre}</p>
                            <p className="text-[13px] text-suave">{etiquetaTipo(pl.tipo)}{nTareas(pl.tareas) ? ` · ${nTareas(pl.tareas)} tareas` : ""}</p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">{frecuencia(pl.cada_dias)}</td>
                          <td className="whitespace-nowrap px-5 py-3">{suyas.length ? familia(suyas.map((a) => a.nombre_equipo)) : "Sin equipos"}</td>
                          <td className="whitespace-nowrap px-5 py-3">
                            {d === null ? <span className="chip bg-panel-2 text-suave">Sin fecha</span>
                              : d < 0 ? <span className="chip bg-paro-suave text-paro-texto">Vencido · {-d} día{d === -1 ? "" : "s"}</span>
                              : <span className={`chip ${d <= 7 ? "bg-alerta-suave text-alerta-texto" : "bg-ok-suave text-ok-texto"}`}>{d === 0 ? "Hoy" : corta(siguiente!.proximo!)}</span>}
                          </td>
                          <td className="w-48 px-5 py-3">
                            <div className="flex justify-between text-[13px] text-suave">
                              <span>{pl.tipo === "proveedor" && pl.cada_dias === null ? "Sin seguimiento" : !suyas.length || !suyas.some((a) => a.ultimo_servicio) ? "Nuevo" : `${alDia} de ${suyas.length}`}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-papel" role="presentation">
                              <div className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-azul"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <aside className="caja-panel p-6">
              <h2 className="text-[19px] font-semibold">Esta semana · {nombreAlcance}</h2>
              <p className="mt-0.5 text-[13px] text-suave">{corta(hoy)} – {corta(finSemana)}</p>
              {entradas.length === 0 ? (
                <p className="py-8 text-center text-[15px] text-suave">Nada programado esta semana.</p>
              ) : (
                <ul className="mt-3">
                  {entradas.slice(0, 8).map((e) => (
                    <li key={`${e.fecha}${e.plan}${e.vencido}`} className="flex items-start gap-4 border-t border-papel py-3">
                      <div className="w-9 shrink-0 text-center">
                        <p className="text-[11px] text-suave">{DIAS[diaSemana(e.fecha)]}</p>
                        <p className="text-[20px] font-semibold leading-tight tabular-nums">{+e.fecha.slice(8, 10)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-snug">{e.plan}{e.vencido ? " (atrasado)" : ""}</p>
                        <p className="truncate text-[12px] text-suave" title={e.nombres.join(", ")}>
                          {e.nombres.slice(0, 3).join(", ")}{e.nombres.length > 3 ? ` y ${e.nombres.length - 3} más` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`chip ${e.vencido ? "bg-paro-suave text-paro-texto" : "bg-panel-2 text-suave"}`}>{e.vencido ? "Vencido" : "Programado"}</span>
                        {editar && (e.vencido || e.fecha === hoy) && <BotonHecho pilar={pilar} ids={e.ids} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={qs({ vista: "calendario" })} scroll={false} className="btn-sec mt-4 w-full">Ver calendario del mes</Link>
            </aside>
          </div>
        </>
      )}

      <Seccion titulo="Administrar planes" sub={editar ? "Carga por Excel, crea planes y asígnalos seleccionando equipos." : "Descarga el plan completo en Excel."}
        extra={<a href={`/p/${pilar}/planes/excel`} className="btn-sec" download>Descargar Excel</a>}>
        {editar ? (
          <>
            <ImportarPlan pilar={pilar} planes={planes.map((x) => x.nombre)} importar={importarPlan} />
            <PanelPlanes
              key={f.nuevo ?? ""}
              pilar={pilar}
              planes={planes}
              almacenes={cat.almacenes}
              almacenInicial={almacen}
              asignados={todas.reduce<Record<string, string[]>>((m, a) => ((m[a.id_plan] ??= []).push(a.id_equipo), m), {})}
              equipos={cat.equipos.map((e) => ({ id: e.id_equipo, nombre: e.nombre_equipo, sap: e.sap_id, id_almacen: e.id_almacen }))}
              sugerencia={f.nuevo ? { nombre: f.nuevo.slice(0, 80), tipo: "inspeccion", cada: 7 } : undefined}
            />
          </>
        ) : (
          <p className="text-[15px] text-suave">Un supervisor o coordinador puede crear y asignar planes.</p>
        )}
      </Seccion>
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

/** Mes en cuadrícula (lunes a domingo) con los servicios proyectados de cada día; vencidos en rojo. */
function Calendario({ asig, mes, hoy, qs, alcance }: {
  asig: PlanEquipo[]; mes: string; hoy: string; qs: (extra: Record<string, string>) => string; alcance: string;
}) {
  const primero = `${mes}-01`;
  const [a, m] = [+mes.slice(0, 4), +mes.slice(5, 7)];
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const otroMes = (d: number) => new Date(Date.UTC(a, m - 1 + d, 1)).toISOString().slice(0, 7);
  const porDia = new Map<string, Map<string, { n: number; vencido: boolean }>>();
  for (const x of asig) {
    for (const d of ocurrencias(x, primero, ultimo)) {
      const dia = porDia.get(d) ?? new Map();
      const e = dia.get(x.plan) ?? { n: 0, vencido: false };
      e.n++; e.vencido ||= d < hoy;
      porDia.set(d, dia.set(x.plan, e));
    }
  }
  const vacios = diaSemana(primero);
  const dias = Array.from({ length: +ultimo.slice(8, 10) }, (_, i) => sumarDias(primero, i));

  return (
    <section className="entrar entrar-2 caja-panel p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-semibold">{MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} {a} · {alcance}</h2>
        <div className="flex gap-2">
          <Link href={qs({ vista: "calendario", mes: otroMes(-1) })} scroll={false} className="btn-sec min-h-10 px-4" aria-label="Mes anterior">‹</Link>
          <Link href={qs({ vista: "calendario" })} scroll={false} className="btn-sec min-h-10 px-4 text-[15px]">Hoy</Link>
          <Link href={qs({ vista: "calendario", mes: otroMes(1) })} scroll={false} className="btn-sec min-h-10 px-4" aria-label="Mes siguiente">›</Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-control)] bg-papel">
          {DIAS.map((d) => <div key={d} className="bg-panel px-2 py-2 text-center text-[11px] font-medium text-suave">{d}</div>)}
          {Array.from({ length: vacios }, (_, i) => <div key={`v${i}`} className="bg-panel/60" />)}
          {dias.map((d) => {
            const items = [...(porDia.get(d) ?? new Map())];
            return (
              <div key={d} className={`min-h-24 bg-panel p-2 ${d === hoy ? "ring-2 ring-inset ring-azul" : ""}`}>
                <p className={`text-[13px] tabular-nums ${d === hoy ? "font-semibold text-azul" : "text-suave"}`}>{+d.slice(8, 10)}</p>
                <ul className="mt-1 space-y-1">
                  {items.slice(0, 3).map(([plan, e]) => (
                    <li key={plan} title={`${plan}: ${e.n} equipo${e.n === 1 ? "" : "s"}`}
                      className={`truncate rounded-md px-1.5 py-0.5 text-[11px] ${e.vencido ? "bg-paro-suave text-paro-texto" : "bg-info-suave text-info-texto"}`}>
                      {e.n} · {plan}
                    </li>
                  ))}
                  {items.length > 3 && <li className="text-[11px] text-suave">+{items.length - 3} más</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
