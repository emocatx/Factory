"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * <details> que se cierra solo: al hacer clic fuera, con Esc (y devuelve el foco al botón) o al
 * navegar a otra página. El contenido puede venir del servidor (formularios con acciones incluidos).
 */
export function MenuDesplegable({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const ruta = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fuera = (e: PointerEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) { el.open = false; el.querySelector("summary")?.focus(); }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", tecla); };
  }, []);

  useEffect(() => { if (ref.current) ref.current.open = false; }, [ruta]);

  return <details ref={ref} className={className}>{children}</details>;
}
