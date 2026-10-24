"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Formulario GET de filtros que actualiza la URL sin recargar la página:
 * el servidor vuelve a calcular los datos y solo cambia lo necesario.
 * Sin JavaScript sigue funcionando como un formulario normal.
 */
export function FormFiltros({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const [cargando, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    new FormData(e.currentTarget).forEach((v, k) => { if (typeof v === "string" && v) params.set(k, v); });
    const qs = params.toString();
    iniciar(() => router.replace(qs ? `${ruta}?${qs}` : ruta, { scroll: false }));
  }

  return (
    <form method="get" onSubmit={enviar} aria-busy={cargando} data-cargando={cargando || undefined} className={className}>
      {children}
    </form>
  );
}
