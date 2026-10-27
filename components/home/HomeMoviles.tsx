"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Almacen, DatosHome, Ind } from "@/lib/home";
import { NAVES_EN_ESCENA } from "@/lib/homeComun";
import { indicadoresAlmacen } from "@/app/(app)/p/[pilar]/resumen/acciones";

// La escena solo se descarga en escritorio con WebGL (ver useModoVista).
const Escena3D = dynamic(() => import("./Escena3D"), { ssr: false, loading: () => <Cargando /> });

const num = (n: number) => n.toLocaleString("es-MX");
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const horas = (h: number | null) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${num(Math.round(h))} h`);

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
    <Link href={href} className="flex items-center gap-3 rounded-[20px] bg-white/80 p-2.5 pr-4 backdrop-blur-xl transition-colors hover:bg-white lg:shadow-[0_8px_24px_rgb(0_0_0/0.06)]">
      <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-panel-2" strokeDasharray={`${arco} ${c}`} transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className={`${trazo} transition-[stroke-dasharray] duration-500`} strokeDasharray={`${arco * f} ${c}`} transform="rotate(135 32 32)" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-suave">{etiqueta}</span>
        <span className="block text-[22px] font-semibold leading-tight tracking-tight tabular-nums">{texto}</span>
        <span className="block text-[11px] text-suave">{meta}</span>
      </span>
      <span className="text-suave" aria-hidden="true">›</span>
    </Link>
  );
}

function PanelTaller({ abierto, onCerrar, titulo, lista, total, base, almacen }: {
  abierto: boolean; onCerrar: () => void; titulo: string; lista: Almacen["taller"]; total: number; base: string; almacen: string | null;
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
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[24px] bg-white shadow-[0_-12px_40px_rgb(0_0_0/0.18)] lg:absolute lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-4 lg:max-h-none lg:w-[380px] lg:rounded-[24px] lg:bg-white/90 lg:backdrop-blur-2xl">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="taller-tit" className="text-[20px] font-semibold">{titulo}</h2>
            <p className="text-[13px] text-suave">{total} equipo{total === 1 ? "" : "s"} · del más antiguo al más reciente</p>
          </div>
          <button type="button" onClick={onCerrar} className="flex h-10 w-10 items-center justify-center rounded-full bg-papel text-[18px] hover:bg-panel-2" aria-label="Cerrar lista de equipos en taller">×</button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2">
          {visibles.length === 0 && <li className="px-3 py-8 text-center text-suave">Ningún equipo en taller.</li>}
          {visibles.map((o) => (
            <li key={o.idOrden}>
              <Link href={`${base}/ordenes?q=${encodeURIComponent(o.folio)}`} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-papel">
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
        <Link href={`${base}/ordenes${almacen ? `?q=${encodeURIComponent(almacen)}` : ""}`} className="btn-motivo m-3 justify-between">
          Ver {almacen ? `las ${total} órdenes de ${almacen}` : `las ${total} órdenes abiertas`} en Órdenes <span aria-hidden="true">›</span>
        </Link>
      </aside>
    </>
  );
}

export function HomeMoviles({ datos, base, almacenInicial }: { datos: DatosHome; base: string; almacenInicial: string | null }) {
  const { modo, quieto } = useModoVista();
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
  const naves = useMemo(() => almacenes.slice(0, NAVES_EN_ESCENA).map(({ id, nombre, total, paro, detenidos, operando }) => ({ id, nombre, total, paro, detenidos, operando })), [almacenes]);
  const masAntiguo = [...v.taller].sort((a, b) => b.dias - a.dias)[0];
  const delta = v.fallas - v.fallasPrevias;

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
    ? `${alm.nombre}: ${alm.paro} de ${alm.total} equipos en taller${masAntiguo ? `; el más antiguo lleva ${masAntiguo.dias} días` : ""}`
    : datos.hallazgo;
  const enlaceInd = `${base}/indicadores${alm ? `?almacen=${alm.id}` : ""}`;

  const panelFlota = (
    <div className="rounded-[24px] bg-white/80 p-5 backdrop-blur-xl lg:shadow-[0_8px_24px_rgb(0_0_0/0.06)]" aria-live="polite" data-tour="flota">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold">{alm ? `Equipos en ${alm.nombre}` : "Equipos en flota"}</h2>
        {alm && <button type="button" onClick={() => elegir(null)} className="chip bg-papel text-tinta hover:bg-panel-2" aria-label="Quitar filtro de almacén">{alm.nombre} ×</button>}
      </div>
      <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight tabular-nums">{num(v.total)}</p>
      <div className="mt-4 flex h-1.5 gap-[3px] overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`${pct(pOp)} operando, ${pct(pTaller)} en taller`}>
        <span className="rounded-full bg-ok" style={{ width: `${pOp}%` }} />
        <span className="rounded-full bg-paro" style={{ width: `${pTaller}%` }} />
      </div>
      <dl className="mt-3 space-y-0.5 text-[14px]">
        <div className="grid grid-cols-[12px_1fr_44px_52px] items-center gap-1 py-1"><span className="h-2 w-2 rounded-full bg-ok" /><dt className="text-suave">Operando</dt><dd className="text-right tabular-nums">{num(operando)}</dd><dd className="text-right tabular-nums">{pct(pOp)}</dd></div>
        <button type="button" onClick={() => setTaller(true)} aria-haspopup="dialog"
          className="-mx-2 grid w-[calc(100%+16px)] cursor-pointer grid-cols-[12px_1fr_44px_52px_10px] items-center gap-1 rounded-xl bg-paro-suave px-2 py-1 text-left hover:bg-[#fbdcdc]">
          <span className="h-2 w-2 rounded-full bg-paro" /><span className="text-paro-texto">En taller</span><span className="text-right tabular-nums">{v.paro}</span><span className="text-right tabular-nums">{pct(pTaller)}</span><span className="text-suave" aria-hidden="true">›</span>
        </button>
        <div className="grid grid-cols-[12px_1fr_44px_52px] items-center gap-1 py-1"><span className="h-2 w-2 rounded-full bg-[#5e5ce6]" /><dt className="text-suave">Renta / leasing</dt><dd className="text-right tabular-nums">{v.externos}</dd><dd className="text-right tabular-nums">{pct(pExt)}</dd></div>
      </dl>
      <button type="button" onClick={() => setTaller(true)} aria-haspopup="dialog" className="enlace mt-3 cursor-pointer text-[14px]">Ver equipos en taller ›</button>
    </div>
  );

  const medidores = (
    <div className="grid gap-2.5" data-tour="indicadores">
      <Medidor etiqueta="Disponibilidad" texto={pct(ind?.disp ?? null)} meta={metas.disponibilidad ? `meta ${metas.disponibilidad}%` : "sin meta"} href={enlaceInd}
        frac={ind?.disp != null ? ind.disp / 100 : null} tono={ind?.disp == null || metas.disponibilidad == null ? "neutro" : ind.disp >= metas.disponibilidad ? "ok" : "alerta"} />
      <Medidor etiqueta="MTTR · reparación" texto={horas(ind?.mttr ?? null)} meta={ind && ind.mttr === null ? `sin cierres en ${periodo.nombre}` : metas.mttr ? `meta ${metas.mttr} h` : "sin meta"} href={enlaceInd}
        frac={ind?.mttr && metas.mttr ? metas.mttr / ind.mttr : null} tono={ind?.mttr == null || metas.mttr == null ? "neutro" : ind.mttr <= metas.mttr ? "ok" : "paro"} />
      <Medidor etiqueta="MTBF · entre fallas" texto={horas(ind?.mtbf ?? null)} meta={ind && ind.mtbf === null ? `sin fallas en ${periodo.nombre}` : metas.mtbf ? `meta ${metas.mtbf} h` : "sin meta definida"} href={enlaceInd}
        frac={ind?.mtbf != null ? (metas.mtbf ? ind.mtbf / metas.mtbf : 1) : null} tono={ind?.mtbf == null || metas.mtbf == null ? "neutro" : ind.mtbf >= metas.mtbf ? "ok" : "alerta"} />
    </div>
  );

  return (
    <>
      {/* Encabezado: el hallazgo de la pantalla, el periodo y la acción principal de este rol */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[19px] font-semibold text-paro-texto" data-tour="hallazgo">{hallazgo}</p>
          <p className="mt-1 text-[13px] text-suave">Actualizado {new Date(datos.actualizado).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se actualiza al registrar o liberar</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <nav aria-label="Periodo" className="inline-flex rounded-full bg-panel-2 p-1">
            {[["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"]].map(([p, t]) => (
              <Link key={p} href={qPeriodo(p)} scroll={false} aria-current={periodo.v === p ? "true" : undefined}
                className={`flex min-h-9 items-center rounded-full px-3.5 text-[14px] ${periodo.v === p ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>{t}</Link>
            ))}
          </nav>
          <label className="sr-only" htmlFor="home-almacen">Almacén</label>
          <select id="home-almacen" value={seleccion ?? ""} onChange={(e) => elegir(e.target.value || null)} className="selector min-h-11 w-auto rounded-full">
            <option value="">Todos los almacenes</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.paro ? ` · ${a.paro} en taller` : ""}</option>)}
          </select>
          {datos.accion && (
            <Link href={datos.accion.href} className="btn-primario min-h-11 w-full sm:w-auto" data-tour="accion">{datos.accion.texto}</Link>
          )}
          {datos.puedeRegistrar && datos.accion?.href !== `${base}/registro` && (
            <Link href={`${base}/registro`} className="btn-sec min-h-11 w-full sm:w-auto">Registrar falla</Link>
          )}
        </div>
      </div>

      {modo === null ? (
        <div className="esqueleto h-[420px] lg:h-[620px]" aria-hidden="true" />
      ) : modo === "3d" ? (
        /* Escritorio: la planta en 3D con los paneles flotando encima */
        <section className="relative h-[min(760px,calc(100vh-180px))] min-h-[620px] overflow-hidden rounded-caja bg-papel" aria-label="Planta de Móviles">
          <Escena3D naves={naves} seleccion={seleccion} onSelect={elegir} onTaller={abrirTaller} quieto={quieto} />
          <div className="absolute left-4 top-4 z-[2] w-[300px]">{panelFlota}</div>
          {!taller && <div className="absolute right-4 top-4 z-[2] w-[236px]">{medidores}</div>}
          <nav aria-label="Almacén en la planta" className="absolute bottom-4 left-1/2 z-[2] flex -translate-x-1/2 gap-0.5 rounded-full bg-white/80 p-1 shadow-[0_8px_24px_rgb(0_0_0/0.08)] backdrop-blur-xl">
            <button type="button" onClick={() => elegir(null)} aria-pressed={!seleccion} className={`min-h-9 cursor-pointer rounded-full px-3.5 text-[13px] ${!seleccion ? "bg-tinta font-medium text-white" : "text-suave hover:text-tinta"}`}>Todos</button>
            {naves.map((n) => (
              <button key={n.id} type="button" onClick={() => elegir(n.id)} aria-pressed={seleccion === n.id} title={n.nombre}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] ${seleccion === n.id ? "bg-tinta font-medium text-white" : "text-suave hover:text-tinta"}`}>
                {n.paro > 0 && <span className="h-1.5 w-1.5 rounded-full bg-paro" aria-hidden="true" />}{n.nombre}
              </button>
            ))}
          </nav>
          <PanelTaller abierto={taller} onCerrar={cerrarTaller} titulo={`En taller${alm ? ` · ${alm.nombre}` : ""}`} lista={v.taller} total={v.paro} base={base} almacen={alm?.nombre ?? null} />
        </section>
      ) : (
        /* Celular, tablet o sin WebGL: lo mismo en 2D, sin la escena */
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            {panelFlota}
            <section className="rounded-[24px] bg-white p-5" aria-labelledby="alm-tit">
              <h2 id="alm-tit" className="text-[15px] font-semibold">Almacenes con equipos en taller</h2>
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
          {medidores}
          <PanelTaller abierto={taller} onCerrar={cerrarTaller} titulo={`En taller${alm ? ` · ${alm.nombre}` : ""}`} lista={v.taller} total={v.paro} base={base} almacen={alm?.nombre ?? null} />
        </div>
      )}

      {/* Accesos con dato: cada tarjeta lleva a la herramienta que ya existe */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-tour="accesos">
        <Link href={`${base}/ordenes${alm ? `?q=${encodeURIComponent(alm.nombre)}` : ""}`} className="tarjeta-enlace p-5">
          <span className="flex items-center justify-between text-[15px] font-semibold">Órdenes abiertas <span className="text-suave" aria-hidden="true">›</span></span>
          <span className="mt-3 block text-[30px] font-semibold leading-none tabular-nums">{num(v.taller.length)}</span>
          <span className="mt-1.5 block text-[13px] text-suave">{masAntiguo ? `La más antigua lleva ${masAntiguo.dias} días` : "Ninguna abierta"}</span>
        </Link>
        <Link href={`${base}/analisis?periodo=${periodo.v === "hoy" ? "7d" : periodo.v}`} className="tarjeta-enlace p-5">
          <span className="flex items-center justify-between text-[15px] font-semibold">Fallas registradas <span className="text-suave" aria-hidden="true">›</span></span>
          <span className="mt-3 block text-[30px] font-semibold leading-none tabular-nums">{num(v.fallas)}</span>
          <span className="mt-1.5 block text-[13px] text-suave">
            {v.fallas === 0 && v.fallasPrevias === 0 ? `Sin fallas en ${periodo.nombre} ni antes`
              : <><b className={`font-semibold ${delta > 0 ? "text-paro-texto" : delta < 0 ? "text-ok-texto" : ""}`}>{delta > 0 ? "+" : ""}{delta}</b> contra el periodo anterior ({v.fallasPrevias})</>}
          </span>
        </Link>
        <Link href={`${base}/analisis?periodo=${periodo.v === "hoy" ? "7d" : periodo.v}`} className="tarjeta-enlace p-5">
          <span className="flex items-center justify-between text-[15px] font-semibold">Origen principal <span className="text-suave" aria-hidden="true">›</span></span>
          <span className="mt-3 block text-[20px] font-semibold leading-tight">{v.origen ? v.origen[0] : "—"}</span>
          <span className="mt-1.5 block text-[13px] text-suave">{v.origen && v.fallas ? `${v.origen[1]} de ${v.fallas} fallas (${Math.round((100 * v.origen[1]) / v.fallas)}%)` : "Sin fallas en el periodo"}</span>
        </Link>
        <Link href={`${base}/analisis?periodo=30d`} className="tarjeta-enlace p-5">
          <span className="flex items-center justify-between text-[15px] font-semibold">Equipo con más fallas <span className="text-suave" aria-hidden="true">›</span></span>
          <span className="mt-3 block truncate text-[20px] font-semibold leading-tight">{v.peor ? v.peor[0] : "—"}</span>
          <span className="mt-1.5 block text-[13px] text-suave">{v.peor ? `${v.peor[1]} falla${v.peor[1] === 1 ? "" : "s"} en 90 días` : "Sin fallas en 90 días"}</span>
        </Link>
      </div>
    </>
  );
}
