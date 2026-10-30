"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Almacen, DatosHome, Ind } from "@/lib/home";
import { indicadoresAlmacen } from "@/app/(app)/p/[pilar]/resumen/acciones";
import { useTema } from "@/components/Tema";

// La escena solo se descarga en escritorio con WebGL (ver useModoVista).
const Escena3D = dynamic(() => import("./Escena3D"), { ssr: false, loading: () => <Cargando /> });

const num = (n: number) => n.toLocaleString("es-MX");
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const horas = (h: number | null) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${num(Math.round(h))} h`);
/** Superficie de vidrio para lo que flota sobre la escena (en 2D es una tarjeta blanca normal). */
const VIDRIO = "rounded-[22px] vidrio";

function Cargando() {
  return <div className="flex h-full items-center justify-center text-[14px] text-suave">Cargando la planta…</div>;
}

/** 3D solo con pantalla ancha, puntero fino (mouse) y WebGL; si no, la versión 2D. */
function useModoVista() {
  const [modo, setModo] = useState<"3d" | "2d" | null>(null);
  const [quieto, setQuieto] = useState(false);
  useEffect(() => {
    const ancho = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const movimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
    const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
    const actualizar = () => setModo(ancho.matches && webgl ? "3d" : "2d");
    actualizar();
    setQuieto(movimiento.matches);
    ancho.addEventListener("change", actualizar);
    return () => ancho.removeEventListener("change", actualizar);
  }, []);
  return { modo, quieto };
}

/** Indicador con arco (270°); lleva a la pantalla de Indicadores. */
function Medidor({ etiqueta, texto, meta, frac, tono, href }: { etiqueta: string; texto: string; meta: string; frac: number | null; tono: "ok" | "alerta" | "paro" | "neutro"; href: string }) {
  const r = 26, c = 2 * Math.PI * r, arco = c * 0.75;
  const f = frac === null ? 0 : Math.max(0, Math.min(1, frac));
  const trazo = { ok: "stroke-ok", alerta: "stroke-alerta", paro: "stroke-paro", neutro: "stroke-suave" }[tono];
  return (
    <Link href={href} className={`flex items-center gap-3 p-2.5 pr-4 transition-colors hover:bg-vidrio-fuerte ${VIDRIO}`}>
      <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-panel-2" strokeDasharray={`${arco} ${c}`} transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={`${trazo} transition-[stroke-dasharray] duration-500`} strokeDasharray={`${arco * f} ${c}`} transform="rotate(135 32 32)" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-suave">{etiqueta}</span>
        <span className="block text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{texto}</span>
        <span className="block truncate text-[11px] text-suave">{meta}</span>
      </span>
      <span className="text-suave" aria-hidden="true">›</span>
    </Link>
  );
}

/** Tarjeta de acceso con dato: lleva a la herramienta que ya existe. */
function Acceso({ href, titulo, valor, pie, chico }: { href: string; titulo: string; valor: string; pie: React.ReactNode; chico?: boolean }) {
  return (
    <Link href={href} className={`block p-4 transition-colors hover:bg-vidrio-fuerte ${VIDRIO}`}>
      <span className="flex items-center justify-between text-[14px] font-semibold">{titulo} <span className="text-suave" aria-hidden="true">›</span></span>
      <span className={`mt-2 block font-semibold leading-tight tabular-nums ${chico ? "line-clamp-2 text-[17px]" : "text-[28px] leading-none"}`}>{valor}</span>
      <span className="mt-1.5 block text-[12px] text-suave">{pie}</span>
    </Link>
  );
}

function PanelTaller({ abierto, onCerrar, titulo, lista, total, base, almacen, qs }: {
  abierto: boolean; onCerrar: () => void; titulo: string; lista: Almacen["taller"]; total: number; base: string; almacen: string | null;
  /** Almacén y periodo actuales, para que Órdenes abra con el mismo filtro. */
  qs: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!abierto) return;
    ref.current?.querySelector("button")?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  const visibles = [...lista].sort((a, b) => b.dias - a.dias).slice(0, 40);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={onCerrar} aria-hidden="true" />
      <aside ref={ref} role="dialog" aria-modal="true" aria-labelledby="taller-tit"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[24px] bg-panel shadow-[0_-12px_40px_rgb(0_0_0/0.18)] lg:absolute lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:max-h-none lg:w-[380px] lg:rounded-[24px] lg:vidrio-fuerte">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="taller-tit" className="text-[20px] font-semibold">{titulo}</h2>
            <p className="text-[13px] text-suave">{total} equipo{total === 1 ? "" : "s"} · del más antiguo al más reciente</p>
          </div>
          <button type="button" onClick={onCerrar} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-papel text-[20px] hover:bg-panel-2" aria-label="Cerrar lista de equipos en Mantto">×</button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2">
          {visibles.length === 0 && <li className="px-3 py-8 text-center text-suave">Ningún equipo en Mantto.</li>}
          {visibles.map((o) => (
            <li key={o.idOrden}>
              <Link href={`${base}/ordenes?${qs}${qs ? "&" : ""}orden=${o.idOrden}`} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-papel">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{o.equipo}</span>
                  <span className="block text-[12px] text-suave tabular-nums">{[o.modelo, o.folio].filter(Boolean).join(" · ")}</span>
                  <span className="mt-0.5 block truncate text-[13px]">{o.falla}</span>
                </span>
                <span className={`chip shrink-0 ${o.dias > 90 ? "bg-paro-suave text-paro-texto" : o.dias > 30 ? "bg-alerta-suave text-alerta-texto" : "bg-papel text-tinta"}`}>{o.dias} d</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href={`${base}/ordenes${qs ? `?${qs}` : ""}`} className="btn-motivo m-3 justify-between">
          Ver {almacen ? `las ${total} órdenes de ${almacen}` : `las ${total} órdenes abiertas`} en Órdenes <span aria-hidden="true">›</span>
        </Link>
      </aside>
    </>
  );
}

/** Filtro en píldora: etiqueta tenue y el valor elegido en negritas, con un select nativo (teclado y lector de pantalla). */
function Filtro({ id, etiqueta, value, onChange, children }: { id: string; etiqueta: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full vidrio py-1 pl-4 pr-1">
      <label htmlFor={id} className="text-[13px] text-suave">{etiqueta}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="selector min-h-9 w-auto max-w-[220px] truncate rounded-full border-0 bg-panel-2 py-0 pl-3.5 text-[14px] font-semibold text-tinta hover:bg-borde/60">
        {children}
      </select>
    </div>
  );
}

export function HomeMoviles({ datos, base, almacenInicial }: { datos: DatosHome; base: string; almacenInicial: string | null }) {
  const { modo, quieto } = useModoVista();
  const oscuro = useTema() === "oscuro";
  const [seleccion, setSeleccion] = useState<string | null>(almacenInicial);
  const [taller, setTaller] = useState(false);
  const [indCache, setIndCache] = useState<Record<string, Ind>>({});
  const [, iniciar] = useTransition();
  const { global, almacenes, metas, periodo } = datos;

  const alm = almacenes.find((a) => a.id === seleccion) ?? null;
  const ind = alm ? alm.ind ?? indCache[alm.id] ?? null : global.ind;
  const v = alm ?? global;
  const operando = v.total - v.paro;
  const pOp = v.total ? (100 * operando) / v.total : 0;
  const pTaller = v.total ? (100 * v.paro) / v.total : 0;
  const pExt = v.total ? (100 * v.externos) / v.total : 0;
  // Vista general: todos los almacenes (los de más equipos en Mantto primero).
  // Al filtrar uno, la planta dibuja solo ese almacén, centrado y con todo el detalle.
  const naves = useMemo(() => almacenes
    .filter((a) => !seleccion || a.id === seleccion)
    .map(({ id, nombre, total, paro, detenidos, operando }) => ({ id, nombre, total, paro, detenidos, operando })), [almacenes, seleccion]);
  const masAntiguo = [...v.taller].sort((a, b) => b.dias - a.dias)[0];
  const delta = v.fallas - v.fallasPrevias;
  const ordenados = useMemo(() => [...almacenes].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true })), [almacenes]);

  const elegir = useCallback((id: string | null) => {
    setSeleccion(id);
    if (!id) setTaller(false);
    // Enlace directo al almacén sin recargar la página.
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("almacen", id); else u.searchParams.delete("almacen");
    window.history.replaceState(null, "", u);
    const a = almacenes.find((x) => x.id === id);
    if (a && !a.ind && !indCache[a.id]) {
      iniciar(async () => {
        const r = await indicadoresAlmacen(base.split("/").pop()!, a.id, periodo.v);
        if (r) setIndCache((c) => ({ ...c, [a.id]: r }));
      });
    }
  }, [almacenes, base, indCache, periodo.v]);
  const cerrarTaller = useCallback(() => setTaller(false), []);
  const abrirTaller = useCallback((id: string) => { elegir(id); setTaller(true); }, [elegir]);

  const qPeriodo = (p: string) => `?periodo=${p}${seleccion ? `&almacen=${seleccion}` : ""}`;
  const hallazgo = alm
    ? `${alm.nombre}: ${alm.paro} de ${alm.total} equipos en Mantto${masAntiguo ? `; el más antiguo lleva ${masAntiguo.dias} días` : ""}`
    : datos.hallazgo;
  // Contexto que viaja a las demás páginas: el mismo almacén y el mismo periodo que se ven aquí.
  const qs = new URLSearchParams({ periodo: periodo.v, ...(alm ? { almacen: alm.id } : {}) }).toString();
  const enlaceInd = `${base}/indicadores?${qs}`;

  // ── Piezas (las mismas en 3D y en 2D; cambia dónde van) ──────────────────────────────────
  const titulo = (
    <div className="min-w-0">
      <h1 className="text-[28px] font-semibold leading-[1.05] tracking-tight lg:text-[34px]">Resumen<br className="hidden lg:block" /><span className="lg:hidden"> · </span>Móviles</h1>
      <p className="mt-2 max-w-[340px] text-[15px] font-semibold text-paro-texto" data-tour="hallazgo">{hallazgo}</p>
      <p className="mt-0.5 text-[12px] text-suave">Actualizado {new Date(datos.actualizado).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se actualiza al registrar o liberar</p>
    </div>
  );

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <Filtro id="home-almacen" etiqueta="Almacén" value={seleccion ?? ""} onChange={(v) => elegir(v || null)}>
        <option value="">Todos</option>
        {ordenados.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
      </Filtro>
      <nav aria-label="Periodo" className="inline-flex rounded-full vidrio p-1">
        {[["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"]].map(([p, t]) => (
          <Link key={p} href={qPeriodo(p)} scroll={false} aria-current={periodo.v === p ? "true" : undefined}
            className={`flex min-h-9 items-center rounded-full px-3.5 text-[14px] ${periodo.v === p ? "bg-tinta font-semibold text-sobre-tinta" : "text-suave hover:text-tinta"}`}>{t}</Link>
        ))}
      </nav>
    </div>
  );

  const acciones = (
    <div className="flex flex-wrap items-center gap-2">
      {datos.puedeRegistrar && datos.accion?.href !== `${base}/registro` && (
        <Link href={`${base}/registro`} className="btn-sec min-h-10 w-full sm:w-auto">Registrar falla</Link>
      )}
      {datos.accion && <Link href={datos.accion.href} className="btn-primario min-h-10 w-full sm:w-auto" data-tour="accion">{datos.accion.texto}</Link>}
    </div>
  );

  const panelFlota = (
    <div className={`p-5 ${VIDRIO}`} aria-live="polite" data-tour="flota">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">{alm ? `Equipos en ${alm.nombre}` : "Equipos en flota"}</h2>
        {alm && <button type="button" onClick={() => elegir(null)} className="chip cursor-pointer bg-papel text-tinta hover:bg-panel-2" aria-label="Quitar filtro de almacén">{alm.nombre} ×</button>}
      </div>
      <p className="mt-1 text-[38px] font-semibold leading-none tracking-tight tabular-nums">{num(v.total)}</p>
      <div className="mt-4 flex h-1.5 gap-[3px] overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`${pct(pOp)} operando, ${pct(pTaller)} en Mantto`}>
        <span className="rounded-full bg-ok" style={{ width: `${pOp}%` }} />
        <span className="rounded-full bg-paro" style={{ width: `${pTaller}%` }} />
      </div>
      <dl className="mt-3 space-y-0.5 text-[14px]">
        <div className="grid grid-cols-[12px_1fr_44px_52px] items-center gap-1 py-1"><span className="h-2 w-2 rounded-full bg-ok" /><dt className="text-suave">Operando</dt><dd className="text-right tabular-nums">{num(operando)}</dd><dd className="text-right tabular-nums">{pct(pOp)}</dd></div>
        <button type="button" onClick={() => setTaller(true)} aria-haspopup="dialog"
          className="-mx-2 grid w-[calc(100%+16px)] cursor-pointer grid-cols-[12px_1fr_44px_52px_10px] items-center gap-1 rounded-xl bg-paro-suave px-2 py-1 text-left hover:bg-paro-hover">
          <span className="h-2 w-2 rounded-full bg-paro" /><span className="text-paro-texto">En Mantto</span><span className="text-right tabular-nums">{v.paro}</span><span className="text-right tabular-nums">{pct(pTaller)}</span><span className="text-suave" aria-hidden="true">›</span>
        </button>
        <div className="grid grid-cols-[12px_1fr_44px_52px] items-center gap-1 py-1"><span className="h-2 w-2 rounded-full bg-renta" /><dt className="text-suave">Renta / leasing</dt><dd className="text-right tabular-nums">{v.externos}</dd><dd className="text-right tabular-nums">{pct(pExt)}</dd></div>
      </dl>
      <button type="button" onClick={() => setTaller(true)} aria-haspopup="dialog" className="enlace mt-3 cursor-pointer text-[14px]">Ver equipos en Mantto ›</button>
    </div>
  );

  const ordenes = (
    <Acceso href={`${base}/ordenes?${qs}`} titulo="Órdenes abiertas" valor={num(v.taller.length)}
      pie={masAntiguo ? `La más antigua lleva ${masAntiguo.dias} días` : "Ninguna abierta"} />
  );
  const fallas = (
    <Acceso href={`${base}/analisis?${qs}`} titulo="Fallas registradas" valor={num(v.fallas)} pie={
      <>
        {v.fallas === 0 && v.fallasPrevias === 0 ? `Sin fallas en ${periodo.nombre} ni antes`
          : <><b className={`font-semibold ${delta > 0 ? "text-paro-texto" : delta < 0 ? "text-ok-texto" : ""}`}>{delta > 0 ? "+" : ""}{delta}</b> contra el periodo anterior ({v.fallasPrevias})</>}
        {v.origen && v.fallas > 0 && <span className="mt-0.5 block">Origen principal: <b className="font-semibold text-tinta">{v.origen[0]}</b> ({Math.round((100 * v.origen[1]) / v.fallas)}%)</span>}
      </>
    } />
  );
  const peor = (
    <Acceso href={v.peor ? `${base}/analisis?periodo=90d&equipo=${v.peor[2]}${alm ? `&almacen=${alm.id}` : ""}` : `${base}/analisis?${qs}`} titulo="Equipo con más fallas" valor={v.peor ? v.peor[0] : "—"} chico
      pie={v.peor ? `${v.peor[1]} falla${v.peor[1] === 1 ? "" : "s"} en 90 días` : "Sin fallas en 90 días"} />
  );
  const medidores = [
    <Medidor key="d" etiqueta="Disponibilidad" texto={pct(ind?.disp ?? null)} meta={metas.disponibilidad ? `meta ${metas.disponibilidad}%` : "sin meta"} href={enlaceInd}
      frac={ind?.disp != null ? ind.disp / 100 : null} tono={ind?.disp == null || metas.disponibilidad == null ? "neutro" : ind.disp >= metas.disponibilidad ? "ok" : "alerta"} />,
    <Medidor key="r" etiqueta="MTTR · reparación" texto={horas(ind?.mttr ?? null)} meta={ind && ind.mttr === null ? `sin cierres en ${periodo.nombre}` : metas.mttr ? `meta ${metas.mttr} h` : "sin meta"} href={enlaceInd}
      frac={ind?.mttr && metas.mttr ? metas.mttr / ind.mttr : null} tono={ind?.mttr == null || metas.mttr == null ? "neutro" : ind.mttr <= metas.mttr ? "ok" : "paro"} />,
    <Medidor key="b" etiqueta="MTBF · entre fallas" texto={horas(ind?.mtbf ?? null)} meta={ind && ind.mtbf === null ? `sin fallas en ${periodo.nombre}` : metas.mtbf ? `meta ${metas.mtbf} h` : "sin meta definida"} href={enlaceInd}
      frac={ind?.mtbf != null ? (metas.mtbf ? ind.mtbf / metas.mtbf : 1) : null} tono={ind?.mtbf == null || metas.mtbf == null ? "neutro" : ind.mtbf >= metas.mtbf ? "ok" : "alerta"} />,
  ];
  const panel = <PanelTaller abierto={taller} onCerrar={cerrarTaller} titulo={`En Mantto${alm ? ` · ${alm.nombre}` : ""}`} lista={v.taller} total={v.paro} base={base} almacen={alm?.nombre ?? null} qs={qs} />;

  if (modo === null) return <div className="esqueleto h-[calc(100dvh-96px)] min-h-[560px]" aria-hidden="true" />;

  if (modo === "3d") {
    // Escritorio: la planta ocupa todo; título, filtros, paneles y medidores flotan encima.
    return (
      <section className="relative h-[calc(100dvh-96px)] min-h-[680px] overflow-hidden rounded-caja bg-papel" aria-label="Resumen de Móviles: planta">
        <Escena3D naves={naves} seleccion={seleccion} onSelect={elegir} onTaller={abrirTaller} quieto={quieto} oscuro={oscuro} />
        <div className="pointer-events-none absolute inset-x-5 top-5 z-[2] flex items-start gap-4">
          <div className="pointer-events-auto w-[320px] shrink-0">{titulo}</div>
          <div className="pointer-events-auto mx-auto pt-1">{filtros}</div>
          <div className="pointer-events-auto shrink-0 pt-1">{acciones}</div>
        </div>
        <div className="absolute left-5 top-[168px] z-[2] grid w-[300px] gap-3">
          {panelFlota}
          {ordenes}
          {fallas}
        </div>
        {!taller && (
          <div className="absolute bottom-5 left-[340px] right-5 z-[2] grid grid-cols-4 gap-3" data-tour="indicadores">
            {medidores}
            {peor}
          </div>
        )}
        {panel}
      </section>
    );
  }

  // Celular, tablet o sin WebGL: lo mismo en 2D, sin la escena.
  return (
    <div className="grid gap-4">
      {titulo}
      {acciones}
      {filtros}
      <div className="grid gap-4 md:grid-cols-2">
        {panelFlota}
        <section className={`p-5 ${VIDRIO}`} aria-labelledby="alm-tit">
          <h2 id="alm-tit" className="text-[15px] font-semibold">Almacenes con equipos en Mantto</h2>
          <ul className="mt-3 space-y-1">
            {almacenes.filter((a) => a.paro > 0).slice(0, 12).map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => abrirTaller(a.id)} className={`w-full cursor-pointer rounded-2xl p-3 text-left hover:bg-papel ${seleccion === a.id ? "bg-papel" : ""}`}>
                  <span className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="font-medium">{a.nombre}</span>
                    <span className="tabular-nums text-paro-texto">{a.paro} <span className="text-suave">de {a.total}</span></span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-panel-2"><span className="block h-full rounded-full bg-paro" style={{ width: `${(100 * a.paro) / a.total}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-tour="indicadores">{medidores}</div>
      <div className="grid gap-3 sm:grid-cols-3">{ordenes}{fallas}{peor}</div>
      {panel}
    </div>
  );
}
