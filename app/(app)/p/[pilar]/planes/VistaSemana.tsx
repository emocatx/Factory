import Link from "next/link";
import { catalogosPilar } from "@/lib/datos";
import { esUuid } from "@/lib/filtros";
import { hoyMx, sumarDias } from "@/lib/planes";
import { programaSemana, programaVencidos, resumenPrograma, responsablesPrograma } from "@/lib/programaDatos";
import {
  cumplimiento, cumplimientoATiempo, esEstatusPrograma, ETIQUETA_ESTATUS, porcentaje, rangoSemana, semanaDe,
  ESTATUS_PROGRAMA, type EstatusPrograma, type MetricasPrograma,
} from "@/lib/programa";
import { infoPilar, puedeAsignar } from "@/lib/catalogos";
import { Aviso, Barra, Encabezado, Kpi, Vacio } from "@/components/ui";
import { Desplegable } from "@/components/Desplegable";
import { FormFiltros } from "@/components/FormFiltros";
import { ListaSemana } from "./ListaSemana";
import type { Pilar, Rol } from "@/lib/tipos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const corta = (iso: string) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1].slice(0, 3)}`;
const num = (n: number) => n.toLocaleString("es-MX");
const textoPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-MX")}%`);

const ABIERTOS: EstatusPrograma[] = ["programado", "asignado", "en_ejecucion", "reprogramado"];
/** Cuántos vencidos se traen a la lista (los más viejos primero); el total se cuenta aparte. */
const LIMITE_VENCIDOS = 200;
/** Con más vencidos que esto, la sección empieza plegada para no empujar la semana hacia abajo. */
const PLEGAR_DESDE = 15;

export type FiltrosSemana = { almacen: string; semana?: string; resp?: string; estatus?: string };

/**
 * Programa semanal de preventivos: qué toca en la semana, quién lo hace y qué falta. Arriba el cumplimiento del
 * programa (año, semana y mes actuales); abajo los servicios de la semana elegida, agrupados por día.
 */
export async function VistaSemana({ pilar, perfil, f, segmentado }: {
  pilar: Pilar;
  perfil: { id: string; rol: Rol; nombre: string };
  f: FiltrosSemana;
  segmentado: (vista: string) => React.ReactNode;
}) {
  const hoy = hoyMx();
  const actual = semanaDe(hoy);
  // ?semana=2026-44; si no viene o no existe, la semana de hoy.
  const m = /^(\d{4})-(\d{1,2})$/.exec(f.semana ?? "");
  const elegida = m && rangoSemana(+m[1], +m[2]) ? { anio: +m[1], semana: +m[2] } : actual;
  const rango = rangoSemana(elegida.anio, elegida.semana)!;
  const esActual = elegida.anio === actual.anio && elegida.semana === actual.semana;
  const clave = (s: { anio: number; semana: number }) => `${s.anio}-${s.semana}`;
  const anterior = semanaDe(sumarDias(rango.desde, -7));
  const siguiente = semanaDe(sumarDias(rango.desde, 7));

  const almacen = esUuid(f.almacen) ? f.almacen : "";
  const resp = esUuid(f.resp) ? f.resp : f.resp === "sin" ? "sin" : "";
  const estatus = f.estatus === "abiertos" || f.estatus === "vencidos" || (f.estatus && esEstatusPrograma(f.estatus)) ? f.estatus : "";
  const estatusConsulta: EstatusPrograma[] | undefined =
    estatus === "abiertos" || estatus === "vencidos" ? ABIERTOS : estatus ? [estatus as EstatusPrograma] : undefined;

  const anio = +hoy.slice(0, 4);
  const sub = `Programa semanal de ${infoPilar(pilar).etiqueta}: qué toca, quién lo hace y qué falta.`;
  // Los vencidos van arriba de la semana actual (en otra semana se repetirían o no vendrían al caso), salvo que el
  // filtro de estatus pida algo que no puede estar vencido o un estatus abierto en particular.
  const conVencidos = esActual && (estatus === "" || estatus === "abiertos" || estatus === "vencidos");
  const [{ resumen, error: fallaResumen }, semana, responsables, cat, vencidos] = await Promise.all([
    resumenPrograma(pilar, `${anio}-01-01`, `${anio}-12-31`, { almacen, responsable: resp === "sin" ? undefined : resp }),
    programaSemana(pilar, elegida.anio, elegida.semana, { almacen, responsable: resp, estatus: estatusConsulta }),
    responsablesPrograma(pilar),
    catalogosPilar(pilar, { equipos: false }),
    conVencidos ? programaVencidos(pilar, { almacen, responsable: resp }, LIMITE_VENCIDOS) : null,
  ]);

  const qs = (extra: Record<string, string>) =>
    "?" + new URLSearchParams(Object.entries({ vista: "semana", almacen, resp, estatus, ...extra }).filter(([, v]) => v)).toString();

  const filtros = (
    <FormFiltros className="relative z-30 flex flex-wrap items-center gap-2">
      <input type="hidden" name="vista" value="semana" />
      {!esActual && <input type="hidden" name="semana" value={clave(elegida)} />}
      <Desplegable key={`a${almacen}`} id="semana-almacen" name="almacen" etiqueta="Almacén" compacto autoEnviar defaultValue={almacen}
        opciones={[{ valor: "", etiqueta: "Todos" }, ...cat.almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))]} />
      <Desplegable key={`r${resp}`} id="semana-responsable" name="resp" etiqueta="Responsable" compacto autoEnviar defaultValue={resp}
        opciones={[
          { valor: "", etiqueta: "Todos" },
          { valor: "sin", etiqueta: "Sin asignar" },
          ...[...responsables].sort((a, b) => Number(b.id === perfil.id) - Number(a.id === perfil.id))
            .map((r) => ({ valor: r.id, etiqueta: r.id === perfil.id ? `${r.nombre} (yo)` : r.nombre, detalle: r.rol === "tecnico" ? "Técnico" : "Supervisor" })),
        ]} />
      <Desplegable key={`e${estatus}`} id="semana-estatus" name="estatus" etiqueta="Estatus" compacto autoEnviar defaultValue={estatus}
        opciones={[
          { valor: "", etiqueta: "Todos" },
          { valor: "abiertos", etiqueta: "Por hacer", detalle: "Programado, asignado, en ejecución o reprogramado" },
          { valor: "vencidos", etiqueta: "Vencidos", tono: "paro" },
          ...ESTATUS_PROGRAMA.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTATUS[e] })),
        ]} />
      <button className="sr-only">Aplicar</button>
    </FormFiltros>
  );

  // Sin la migración del programa (tabla, vista y resumen_programa) la consulta falla: solo el aviso.
  if (fallaResumen === "migracion" || semana.error === "migracion") {
    return (
      <>
        <Encabezado titulo="Planes de mantenimiento" sub={sub}>{segmentado("semana")}</Encabezado>
        <div className="entrar entrar-2">
          <Vacio titulo="El programa semanal se activa al aplicar la migración del programa">
            Cuando se aplique, aquí verás los servicios de cada semana, quién los hace y el cumplimiento del programa.
          </Vacio>
        </div>
      </>
    );
  }
  if (!resumen || semana.error) {
    return (
      <>
        <Encabezado titulo="Planes de mantenimiento" sub={sub}>{segmentado("semana")}</Encabezado>
        <div className="entrar entrar-2">
          <Aviso tono="paro">No se pudo cargar el programa. Vuelve a intentarlo en unos minutos.</Aviso>
        </div>
      </>
    );
  }

  const filas = estatus === "vencidos" ? semana.filas.filter((x) => x.vencido) : semana.filas;
  const t = resumen.totales;
  const mes = MESES[+hoy.slice(5, 7) - 1];
  const editor = puedeAsignar(perfil.rol);
  const cambia = editor || perfil.rol === "tecnico";
  const opcionesResponsable = responsables.map((r) => ({ valor: r.id, etiqueta: r.id === perfil.id ? `${r.nombre} (yo)` : r.nombre, detalle: r.rol === "tecnico" ? "Técnico" : "Supervisor" }));

  return (
    <>
      <Encabezado titulo="Planes de mantenimiento" sub={sub}>
        {filtros}
        {segmentado("semana")}
      </Encabezado>

      <div className="entrar entrar-2 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi etiqueta={`Cumplimiento ${anio}`} valor={textoPct(cumplimiento(t))}
          pie={t.programados ? `${num(t.completados)} de ${num(t.programados)} a la fecha` : "Sin servicios a la fecha"}
          info="Completados entre los servicios programados del 1 de enero a hoy (por la fecha original del programa)." />
        <Kpi etiqueta="A tiempo" valor={textoPct(cumplimientoATiempo(t))}
          pie={t.programados ? `${num(t.a_tiempo)} hechos en su semana` : "Sin servicios a la fecha"}
          info="Completados a más tardar el domingo de la semana en que estaban programados." />
        <Kpi etiqueta="Avance de esta semana" valor={<DeTotal parte={resumen.semana.completados} total={resumen.semana.total} />}
          pie={resumen.semana.total ? `${textoPct(porcentaje(resumen.semana.completados, resumen.semana.total))} completado · semana ${actual.semana}` : `Nada programado en la semana ${actual.semana}`} />
        <Kpi etiqueta={`Avance de ${mes}`} valor={<DeTotal parte={resumen.mes.completados} total={resumen.mes.total} />}
          pie={resumen.mes.total ? `${textoPct(porcentaje(resumen.mes.completados, resumen.mes.total))} completado` : "Nada programado este mes"} />
        <Kpi etiqueta="Vencidos" valor={num(t.vencidos)} tono={t.vencidos ? "paro" : "normal"}
          pie={t.vencidos ? "Abiertos de semanas anteriores" : "Todo al día"} />
        <Kpi etiqueta="Reprogramados" valor={num(t.reprogramados)}
          pie={t.no_realizados ? `${num(t.no_realizados)} no realizado${t.no_realizados === 1 ? "" : "s"}` : "Ninguno sin realizar"} />
      </div>

      {vencidos?.error && (
        <div className="entrar entrar-3 mt-6">
          <Aviso tono="paro">No se pudieron cargar los vencidos de semanas anteriores. Vuelve a intentarlo en unos minutos.</Aviso>
        </div>
      )}
      {vencidos && !vencidos.error && vencidos.total > 0 && (
        // suppressHydrationWarning: si alguien la abre antes de que cargue React, el "open" ya no es el del servidor.
        <details className="entrar entrar-3 caja-panel group mt-6" open={vencidos.total <= PLEGAR_DESDE} suppressHydrationWarning>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span className="min-w-0">
              <span className="block text-[20px] font-semibold">
                Vencidos de semanas anteriores <span className="text-paro-texto tabular-nums">({num(vencidos.total)})</span>
              </span>
              <span className="mt-0.5 block text-[14px] text-suave">
                Abiertos con fecha antes del lunes {corta(rango.desde)}, los más viejos primero
                {vencidos.total > vencidos.filas.length ? ` · se muestran los ${num(vencidos.filas.length)} más antiguos de ${num(vencidos.total)}` : ""}
              </span>
            </span>
            <span aria-hidden="true" className="text-suave transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <ListaSemana
            key={`v${almacen}${resp}${estatus}`}
            id="vencidos"
            pilar={pilar}
            filas={vencidos.filas}
            agrupar="semana"
            hoy={hoy}
            yo={perfil.id}
            editor={editor}
            cambia={cambia}
            filtrado={!!(almacen || resp || estatus)}
            responsables={opcionesResponsable}
          />
        </details>
      )}

      <section className="entrar entrar-3 mt-6 caja-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold">Semana {elegida.semana} · {corta(rango.desde)} – {corta(rango.hasta)}</h2>
            <p className="mt-0.5 text-[14px] text-suave">
              {elegida.anio !== anio ? `${elegida.anio} · ` : ""}
              {filas.length ? `${num(filas.length)} servicio${filas.length === 1 ? "" : "s"} · ${num(filas.filter((x) => x.estatus === "completado").length)} completado${filas.filter((x) => x.estatus === "completado").length === 1 ? "" : "s"}` : "Sin servicios"}
              {esActual ? " · semana actual" : ""}
            </p>
          </div>
          <nav aria-label="Cambiar de semana" className="flex gap-2">
            <Link href={qs({ semana: clave(anterior) })} scroll={false} className="btn-sec min-h-10 px-4" aria-label={`Semana ${anterior.semana}`}>‹</Link>
            <Link href={qs({})} scroll={false} aria-current={esActual ? "page" : undefined} className="btn-sec min-h-10 px-4 text-[15px]">Esta semana</Link>
            <Link href={qs({ semana: clave(siguiente) })} scroll={false} className="btn-sec min-h-10 px-4" aria-label={`Semana ${siguiente.semana}`}>›</Link>
          </nav>
        </div>
        <ListaSemana
          key={`${clave(elegida)}${almacen}${resp}${estatus}`}
          id="semana"
          pilar={pilar}
          filas={filas}
          desde={rango.desde}
          hoy={hoy}
          yo={perfil.id}
          editor={editor}
          cambia={cambia}
          filtrado={!!(almacen || resp || estatus)}
          responsables={opcionesResponsable}
        />
      </section>

      <div className="entrar entrar-4 mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Desglose titulo="Por almacén" sub={`Cumplimiento ${anio} a la fecha`}
          filas={resumen.por_almacen.map((x) => ({ clave: x.id_almacen, nombre: x.nombre_almacen ?? "Sin almacén", m: x }))} />
        <Desglose titulo="Por responsable" sub={`Cumplimiento ${anio} a la fecha`}
          filas={resumen.por_responsable.map((x) => ({ clave: x.id_responsable ?? "sin", nombre: x.responsable ?? "Sin asignar", m: x }))} />
      </div>
    </>
  );
}

/** "17 de 42": la parte como cifra y el total más chico, para que quepa en la tarjeta. */
function DeTotal({ parte, total }: { parte: number; total: number }) {
  // En celular "17/42" (la tarjeta mide la mitad del ancho); desde sm, "17 de 42".
  return (
    <span className="whitespace-nowrap">
      {num(parte)}
      <span className="text-[20px] font-medium tracking-normal text-suave"><span className="sm:hidden">/</span><span className="hidden sm:inline"> de </span>{num(total)}</span>
    </span>
  );
}

/** Cumplimiento por grupo, el más bajo primero (lo que hay que atender arriba). */
function Desglose({ titulo, sub, filas }: { titulo: string; sub: string; filas: { clave: string; nombre: string; m: MetricasPrograma }[] }) {
  const orden = [...filas].sort((a, b) => (cumplimiento(a.m) ?? 101) - (cumplimiento(b.m) ?? 101) || a.nombre.localeCompare(b.nombre));
  return (
    <section className="caja-panel p-5">
      <h2 className="text-[17px] font-semibold">{titulo}</h2>
      <p className="mt-0.5 text-[13px] text-suave">{sub}</p>
      {orden.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-suave">Sin servicios en el programa.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {orden.map(({ clave, nombre, m }) => {
            const c = cumplimiento(m);
            return (
              <li key={clave}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="truncate font-semibold">{nombre}</span>
                  <span className="shrink-0 text-[13px] text-suave tabular-nums">
                    {m.programados ? `${num(m.completados)} de ${num(m.programados)} · ` : ""}
                    <span className="font-semibold text-tinta">{textoPct(c)}</span>
                    {m.vencidos ? <span className="text-paro-texto"> · {num(m.vencidos)} vencido{m.vencidos === 1 ? "" : "s"}</span> : null}
                  </span>
                </div>
                <div className="mt-1.5">
                  {c === null ? <p className="text-[12px] text-suave">Nada programado a la fecha</p> : <Barra valor={c} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
