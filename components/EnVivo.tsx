"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Estado = "conectando" | "en_vivo" | "sin_conexion";
const hora = (d: Date) => d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

/**
 * Escucha cambios de órdenes y equipos del tenant (Realtime respeta RLS) y refresca la vista.
 * Solo dice "En vivo" con el canal suscrito y siempre muestra la hora de la última actualización.
 */
export function EnVivo({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<Estado>("conectando");
  const [ultima, setUltima] = useState<Date | null>(null);
  const [girando, setGirando] = useState(false);

  useEffect(() => {
    setUltima(new Date());
    const supabase = createClient();
    const refrescar = () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => {
        router.refresh();
        setUltima(new Date());
      }, 400);
    };
    const canal = supabase
      .channel(`tenant-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_mantenimiento", filter: `tenant_id=eq.${tenantId}` }, refrescar)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipos", filter: `tenant_id=eq.${tenantId}` }, refrescar)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setEstado("en_vivo");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setEstado("sin_conexion");
      });
    return () => {
      if (espera.current) clearTimeout(espera.current);
      supabase.removeChannel(canal);
    };
  }, [tenantId, router]);

  function actualizar() {
    setGirando(true);
    router.refresh();
    setUltima(new Date());
    setTimeout(() => setGirando(false), 600);
  }

  const punto = { conectando: "bg-borde", en_vivo: "bg-ok", sin_conexion: "bg-paro" }[estado];
  const texto = { conectando: "Conectando", en_vivo: "En vivo", sin_conexion: "Sin conexión en vivo" }[estado];

  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-suave" role="status" title={texto}>
        <span className={`h-2 w-2 rounded-full ${punto}`} aria-hidden="true" />
        <span className={`sr-only xl:not-sr-only ${estado === "sin_conexion" ? "font-medium text-paro-texto" : ""}`}>{texto}</span>
        {ultima && <span className="hidden xl:inline">· {hora(ultima)}</span>}
      </span>
      <button onClick={actualizar} className="btn-sec min-h-10 px-4 text-sm" aria-label="Actualizar datos">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"
          className={girando ? "animate-spin" : ""}>
          <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
        </svg>
        Actualizar
      </button>
    </div>
  );
}
