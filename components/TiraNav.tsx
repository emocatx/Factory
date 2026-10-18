"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ItemTira = { href: string; texto: string; visual: React.ReactNode; etiqueta?: string; activo?: boolean; deshabilitado?: boolean };

/**
 * Tira de navegación con iconos y etiqueta (como la fila de productos de una tienda).
 * Se desplaza en horizontal; muestra flechas cuando hay más elementos a los lados.
 */
export function TiraNav({ items, etiquetaNav }: { items: ItemTira[]; etiquetaNav: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const activo = useRef<HTMLAnchorElement>(null);
  const [lados, setLados] = useState({ izq: false, der: false });

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setLados({ izq: el.scrollLeft > 4, der: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    activo.current?.scrollIntoView({ block: "nearest", inline: "center" });
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => { el.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); };
  }, []);

  const mover = (d: number) => caja.current?.scrollBy({ left: d * caja.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <nav aria-label={etiquetaNav} className="relative">
      <div ref={caja} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max gap-2 md:gap-4">
          {items.map((i) => {
            const cuerpo = (
              <>
                <span className="flex h-14 items-end justify-center">{i.visual}</span>
                <span className={`mt-2 text-[14px] leading-tight ${i.activo ? "font-semibold text-tinta" : "font-medium text-tinta"}`}>{i.texto}</span>
                <span className={`mt-0.5 h-4 text-[12px] font-medium ${i.activo ? "text-tinta" : "text-nuevo"}`}>{i.etiqueta ?? ""}</span>
                <span aria-hidden="true" className={`mt-1 h-[3px] w-6 rounded-full ${i.activo ? "bg-tinta" : "bg-transparent"}`} />
              </>
            );
            return (
              <li key={i.href}>
                {i.deshabilitado ? (
                  <span className="flex w-[104px] flex-col items-center px-1 py-2 text-center opacity-45" aria-disabled="true">{cuerpo}</span>
                ) : (
                  <Link
                    ref={i.activo ? activo : undefined}
                    href={i.href}
                    aria-current={i.activo ? "page" : undefined}
                    className="group flex w-[104px] flex-col items-center rounded-2xl px-1 py-2 text-center transition-colors duration-150 hover:bg-panel-2/60"
                  >
                    {cuerpo}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {lados.izq && (
        <button type="button" onClick={() => mover(-1)} aria-label="Ver anteriores"
          className="absolute left-0 top-6 hidden h-9 w-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-panel text-tinta shadow-[0_2px_12px_rgb(0_0_0/0.12)] md:flex">
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2L2 8l6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {lados.der && (
        <button type="button" onClick={() => mover(1)} aria-label="Ver más"
          className="absolute right-0 top-6 hidden h-9 w-9 translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-panel text-tinta shadow-[0_2px_12px_rgb(0_0_0/0.12)] md:flex">
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
    </nav>
  );
}
