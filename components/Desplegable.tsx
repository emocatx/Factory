"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type Opcion = { valor: string; etiqueta: string; detalle?: string; deshabilitada?: boolean; tono?: "paro" | "ok" | "alerta" };

type Props = {
  opciones: Opcion[];
  /** Para formularios: se envía en un input oculto con este nombre. */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  id?: string;
  icono?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  invalido?: boolean;
  describedBy?: string;
  /** Ancho compacto para barras de filtros. */
  compacto?: boolean;
  /** Muestra un buscador cuando hay muchas opciones. */
  buscar?: boolean;
  className?: string;
};

const PUNTO = { paro: "bg-paro", ok: "bg-ok", alerta: "bg-alerta" } as const;

/**
 * Lista desplegable propia: botón redondeado con icono, texto y chevrón; al abrir, una tarjeta flotante
 * blanca con sombra suave. Accesible con teclado (↑ ↓ Inicio Fin Enter Esc y letras).
 */
export function Desplegable({
  opciones, name, value, defaultValue, onChange, placeholder = "Selecciona…", id, icono, required, disabled,
  invalido, describedBy, compacto, buscar, className = "",
}: Props) {
  const propio = useId();
  const idBoton = id ?? `dd-${propio}`;
  const idLista = `${idBoton}-lista`;
  const [interno, setInterno] = useState(defaultValue ?? "");
  const actual = value ?? interno;
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [filtro, setFiltro] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const conBuscador = buscar ?? opciones.length > 12;

  const visibles = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return t ? opciones.filter((o) => (o.etiqueta + " " + (o.detalle ?? "")).toLowerCase().includes(t)) : opciones;
  }, [opciones, filtro]);
  const elegida = opciones.find((o) => o.valor === actual);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  useEffect(() => {
    if (abierto && activo >= 0) lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abierto, activo]);

  function abrir() {
    if (disabled) return;
    setFiltro("");
    setActivo(Math.max(0, opciones.findIndex((o) => o.valor === actual)));
    setAbierto(true);
  }
  function elegir(o: Opcion) {
    if (o.deshabilitada) return;
    if (value === undefined) setInterno(o.valor);
    onChange?.(o.valor);
    setAbierto(false);
    boton.current?.focus();
  }
  function mover(delta: number) {
    if (!visibles.length) return;
    let i = activo;
    for (let n = 0; n < visibles.length; n++) {
      i = (i + delta + visibles.length) % visibles.length;
      if (!visibles[i].deshabilitada) break;
    }
    setActivo(i);
  }
  function teclas(e: React.KeyboardEvent) {
    if (!abierto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActivo(0); }
    else if (e.key === "End") { e.preventDefault(); setActivo(visibles.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (visibles[activo]) elegir(visibles[activo]); }
    else if (e.key === "Escape" || e.key === "Tab") { setAbierto(false); }
    else if (!conBuscador && e.key.length === 1) {
      const i = visibles.findIndex((o) => !o.deshabilitada && o.etiqueta.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActivo(i);
    }
  }

  return (
    <div ref={caja} className={`relative ${compacto ? "inline-block" : "block w-full"} ${className}`} onKeyDown={teclas}>
      {name && <input type="hidden" name={name} value={actual} />}
      {required && (
        <input tabIndex={-1} aria-hidden="true" required value={actual} onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
          onInvalid={(e) => { e.preventDefault(); boton.current?.focus(); }} />
      )}
      <button
        ref={boton}
        id={idBoton}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-describedby={describedBy}
        aria-activedescendant={abierto && activo >= 0 ? `${idLista}-${activo}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[14px] border bg-white text-left text-tinta outline-none transition-[border-color,box-shadow] duration-150
          ${compacto ? "min-h-11 min-w-44 px-3.5 text-[15px]" : "min-h-12 px-4 text-[17px]"}
          ${invalido ? "border-paro" : abierto ? "border-azul ring-4 ring-azul/15" : "border-borde hover:border-[#a1a1a6]"}
          focus-visible:border-azul focus-visible:ring-4 focus-visible:ring-azul/20 disabled:cursor-not-allowed disabled:bg-papel disabled:text-suave`}
      >
        {icono && <span aria-hidden="true" className="shrink-0 text-tinta/80">{icono}</span>}
        {elegida?.tono && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[elegida.tono]}`} />}
        <span className={`min-w-0 flex-1 truncate ${elegida ? "font-medium" : "text-[#86868b]"}`}>{elegida?.etiqueta ?? placeholder}</span>
        <svg aria-hidden="true" width="14" height="9" viewBox="0 0 14 9" className={`shrink-0 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}>
          <path d="M1.5 1.5l5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 z-50 mt-2 min-w-full overflow-hidden rounded-[18px] bg-white shadow-[0_12px_40px_rgb(0_0_0/0.14),0_0_0_1px_rgb(0_0_0/0.04)] motion-safe:animate-[entrar_160ms_ease-out]">
          {conBuscador && (
            <div className="border-b border-papel p-2">
              <input autoFocus value={filtro} onChange={(e) => { setFiltro(e.target.value); setActivo(0); }} placeholder="Buscar…"
                aria-label="Buscar en la lista" className="w-full rounded-[10px] bg-papel px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-azul/30" />
            </div>
          )}
          <ul ref={lista} id={idLista} role="listbox" aria-labelledby={idBoton} tabIndex={-1} className="max-h-72 overflow-y-auto p-1.5">
            {visibles.length === 0 && <li className="px-3 py-3 text-[15px] text-suave">Sin resultados</li>}
            {visibles.map((o, i) => {
              const sel = o.valor === actual;
              return (
                <li
                  key={o.valor + i}
                  id={`${idLista}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={sel}
                  aria-disabled={o.deshabilitada || undefined}
                  onMouseEnter={() => setActivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o)}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[12px] px-3 py-2.5 text-[15px]
                    ${o.deshabilitada ? "cursor-not-allowed opacity-50" : i === activo ? "bg-papel" : ""}`}
                >
                  {o.tono && <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${PUNTO[o.tono]}`} />}
                  <span className="min-w-0 flex-1">
                    <span className={`block ${sel ? "font-semibold" : "font-medium"}`}>{o.etiqueta}</span>
                    {o.detalle && <span className="block text-[13px] text-suave">{o.detalle}</span>}
                  </span>
                  {sel && (
                    <svg aria-hidden="true" width="14" height="11" viewBox="0 0 14 11" className="mt-1 shrink-0 text-azul">
                      <path d="M1.5 5.5l3.5 3.5 7.5-7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
