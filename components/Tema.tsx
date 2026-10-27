"use client";

import { useEffect, useState } from "react";

export type Tema = "claro" | "oscuro";

/** Tema actual (lee <html data-tema>) y se actualiza si cambia desde el interruptor. */
export function useTema(): Tema {
  const [tema, setTema] = useState<Tema>("claro");
  useEffect(() => {
    const html = document.documentElement;
    const leer = () => setTema(html.dataset.tema === "oscuro" ? "oscuro" : "claro");
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(html, { attributes: true, attributeFilter: ["data-tema"] });
    return () => obs.disconnect();
  }, []);
  return tema;
}

/**
 * Interruptor de modo oscuro del menú de cuenta. Cambia el tema al instante y lo guarda en la
 * cookie "tema" (un año), que el layout raíz lee para pintar ya en oscuro sin parpadeo.
 */
export function InterruptorTema() {
  const tema = useTema();
  const oscuro = tema === "oscuro";
  function cambiar() {
    const nuevo: Tema = oscuro ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    document.cookie = `tema=${nuevo}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button type="button" role="switch" aria-checked={oscuro} onClick={cambiar}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] text-tinta transition-colors hover:bg-papel">
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-suave" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      <span className="flex-1">Modo oscuro</span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${oscuro ? "bg-azul" : "bg-panel-2"}`} aria-hidden="true">
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-panel shadow transition-[left] ${oscuro ? "left-5" : "left-1"}`} />
      </span>
    </button>
  );
}
