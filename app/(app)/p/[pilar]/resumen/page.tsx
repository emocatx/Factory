import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";

import { horas, pct } from "@/lib/formato";
import { Barra, Encabezado, Seccion, Vacio } from "@/components/ui";
import { GraficaTendencia } from "@/components/GraficaTendencia";
import type { DisponibilidadAlmacen, PuntoTendencia, ResumenOrdenes, SaludLinea } from "@/lib/tipos";

export const metadata = { title: "Resumen de órdenes" };

const GRANOS = [
  { v: "semana", t: "Semana", n: 12 },
  { v: "mes", t: "Mes", n: 12 },
  { v: "anio", t: "Año", n: 5 },
] as const;

export default async function Resumen({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ grano?: string }>;
}) {
  const { pilar: p } = await params;
  const { pilar } = await sesionDePilar(p);
  const { grano: g } = await searchParams;
  const grano = GRANOS.find((x) => x.v === g) ?? GRANOS[0];
  const supabase = await createClient();

  const [{ data: r }, { data: serie }, { data: lineas }, { data: almacenes }] = await Promise.all([
    supabase.rpc("resumen_ordenes", { p_pilar: pilar }).single(),
    supabase.rpc("tendencia_ordenes", { p_grano: grano.v, p_periodos: grano.n, p_pilar: pilar }),
    pilar === "dorsales"
      ? supabase.from("v_salud_lineas").select("*").order("carga_abierta", { ascending: false }).order("nombre_linea")
      : Promise.resolve({ data: [] }),
    pilar !== "dorsales"
      ? supabase.from("v_disponibilidad_almacen").select("*").eq("tipo_pilar", pilar).order("pct_disponibilidad", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const res = (r ?? { abiertas: 0, pendientes: 0, en_proceso: 0, cerradas: 0, ingresos_hoy: 0, cierres_hoy: 0, mttr_horas: null, abierta_mas_antigua: null }) as ResumenOrdenes;
  const puntos = ((serie ?? []) as PuntoTendencia[]).map((x) => ({ ...x, ingresadas: Number(x.ingresadas), cerradas: Number(x.cerradas) }));
  const neto = puntos.reduce((s, x) => s + x.ingresadas - x.cerradas, 0);
  const salud = (lineas ?? []) as SaludLinea[];
  const disp = (almacenes ?? []) as DisponibilidadAlmacen[];
  const critica = salud.find((l) => l.carga_abierta > 0 && l.pct_salud < 80);
  const horasAntigua = res.abierta_mas_antigua ? (Date.now() - new Date(res.abierta_mas_antigua).getTime()) / 3600000 : null;

  const titular = res.abiertas === 0
    ? "Sin backlog abierto en este corte."
    : `${res.abiertas} ${res.abiertas === 1 ? "orden abierta" : "órdenes abiertas"}; la más antigua lleva ${horas(horasAntigua)}.`;

  return (
    <>
      <Encabezado

        titulo="Resumen de órdenes"
        sub="Volumen, responsables y estado general de las órdenes."
      />

      <section className="entrar caja-panel px-6 py-10 text-center md:px-12 md:py-14">
        <p className="mx-auto max-w-3xl text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px]">{titular}</p>
        <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-2">
          <div className="rounded-[18px] bg-papel p-5">
            <p className="text-sm text-suave">Señal del periodo</p>
            <p className="mt-1 text-[19px] font-semibold">
              {neto > 0 ? `Entran más de las que se cierran (+${neto})` : neto < 0 ? `Ritmo de cierre por encima de los ingresos (${neto})` : "Ritmo de cierre equilibrado"}
            </p>
          </div>
          <div className="rounded-[18px] bg-papel p-5">
            <p className="text-sm text-suave">Riesgo</p>
            <p className="mt-1 text-[19px] font-semibold">
              {critica ? `Atención en ${critica.nombre_linea}` : res.pendientes > 0 ? `${res.pendientes} sin asignar` : "Sin línea crítica"}
            </p>
          </div>
        </div>
      </section>

      <div className="entrar entrar-2 mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Órdenes abiertas", res.abiertas, "Pendientes, asignadas o en proceso"],
          ["Órdenes cerradas", res.cerradas, "Concluidas en el histórico"],
          ["Cierres hoy", res.cierres_hoy, `Ingresos hoy: ${res.ingresos_hoy}`],
          ["MTTR histórico", horas(res.mttr_horas), "Tiempo medio de paro de las cerradas"],
        ].map(([t, v, s]) => (
          <div key={String(t)} className="caja-panel p-6">
            <p className="text-sm font-semibold text-suave">{t}</p>
            <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{v}</p>
            <p className="mt-3 text-[13px] text-suave">{s}</p>
          </div>
        ))}
      </div>

      <Seccion
        titulo="Evolución de órdenes"
        sub={`Balance del periodo: ${neto > 0 ? "+" : ""}${neto}`}
        extra={
          <nav aria-label="Agrupar por" className="inline-flex rounded-full bg-panel p-1">
            {GRANOS.map((x) => (
              <Link key={x.v} href={`?grano=${x.v}`} aria-current={x.v === grano.v ? "true" : undefined}
                className={`flex min-h-10 items-center rounded-full px-4 text-[15px] ${x.v === grano.v ? "bg-tinta font-semibold text-white" : "hover:bg-panel-2"}`}>
                {x.t}
              </Link>
            ))}
          </nav>
        }
      >
        <div className="caja-panel p-6">
          <GraficaTendencia datos={puntos} grano={grano.v} />
        </div>
      </Seccion>

      {pilar === "dorsales" ? (
        <Seccion titulo="Análisis por línea" sub="Carga abierta, cierres y salud para priorizar atención." extra={<span className="chip bg-panel-2 text-suave">{salud.length} líneas</span>}>
          {salud.length === 0 ? (
            <Vacio titulo="Aún no hay líneas" accion={<Link href="/configuracion" className="btn-primario">Dar de alta líneas</Link>} />
          ) : (
            <ul className="space-y-3">
              {salud.map((l) => {
                const carga = l.total_ordenes ? (100 * l.carga_abierta) / l.total_ordenes : 0;
                return (
                  <li key={l.id_linea} className="caja-panel grid items-center gap-4 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto]">
                    <div>
                      <p className="text-lg font-semibold">{l.nombre_linea}</p>
                      <p className="text-sm text-suave">
                        {l.carga_abierta === 0 ? "Sin carga abierta" : `${l.carga_abierta} abierta${l.carga_abierta === 1 ? "" : "s"}`} · MTTR {horas(l.mttr_horas)}
                      </p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-3"><span className="w-32 shrink-0 whitespace-nowrap text-suave">Carga abierta</span><Barra valor={carga} tono="alerta" /><span className="w-14 shrink-0 text-right tabular-nums">{pct(carga)}</span></div>
                      <div className="flex items-center gap-3"><span className="w-32 shrink-0 whitespace-nowrap text-suave">Cierre histórico</span><Barra valor={Number(l.pct_salud)} /><span className="w-14 shrink-0 text-right tabular-nums">{pct(l.pct_salud)}</span></div>
                    </div>
                    <div className="flex gap-2 text-center">
                      {[["Abiertas", l.carga_abierta], ["Cerradas", l.cierres_historicos], ["Salud", pct(l.pct_salud)]].map(([t, v]) => (
                        <div key={String(t)} className="min-w-[72px] rounded-xl bg-papel px-3 py-2">
                          <p className="font-semibold tabular-nums">{v}</p><p className="text-[13px] text-suave">{t}</p>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Seccion>
      ) : (
        <Seccion titulo="Disponibilidad por almacén" sub="Equipos del pilar contra equipos parados en este momento, del más comprometido al menos.">
          {disp.length === 0 ? (
            <Vacio titulo="Aún no hay equipos en este pilar" accion={<Link href={`/p/${pilar}/equipos`} className="btn-primario">Dar de alta equipos</Link>} />
          ) : (
            <div className="caja-panel overflow-x-auto">
              <table className="w-full min-w-[640px] text-[15px]">
                <thead className="text-left text-sm text-suave">
                  <tr>
                    <th className="px-5 pb-2 pt-4 font-medium">Almacén</th>
                    <th className="px-5 pb-2 pt-4 text-right font-medium">Total</th>
                    <th className="px-5 pb-2 pt-4 text-right font-medium">Parados</th>
                    <th className="px-5 pb-2 pt-4 text-right font-medium">Disponibles</th>
                    <th className="w-1/3 px-5 pb-2 pt-4 font-medium">Disponibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {disp.map((a) => (
                    <tr key={a.id_almacen} className="odd:bg-papel/60">
                      <td className="px-5 py-3 font-semibold">{a.nombre_almacen}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{a.total_equipos}</td>
                      <td className={`px-5 py-3 text-right tabular-nums ${a.equipos_parados ? "font-semibold text-paro-texto" : ""}`}>{a.equipos_parados}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{a.equipos_disponibles}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3"><Barra valor={Number(a.pct_disponibilidad ?? 0)} /><span className="w-14 text-right font-semibold tabular-nums">{pct(a.pct_disponibilidad)}</span></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>
      )}
    </>
  );
}
