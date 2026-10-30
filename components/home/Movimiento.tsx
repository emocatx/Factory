"use client";

// Dibujo a pedido. Las escenas usan frameloop="demand": solo se dibuja un cuadro cuando algo cambia (cámara,
// datos, tema o tamaño). Los equipos y las marcas se animan mientras hay actividad en la página (puntero, rueda o
// teclado) y unos segundos después; luego todo se queda donde está y la tarjeta gráfica descansa (0 cuadros en
// reposo). Con "reducir movimiento" nada se anima: solo se dibuja lo que cambia.
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Reloj de la animación: `t` (segundos) solo avanza mientras hay movimiento, así al reanudar nada salta. */
export type Reloj = { t: number; vivo: boolean };
const RelojContexto = createContext<Reloj>({ t: 0, vivo: false });
export const useReloj = () => useContext(RelojContexto);

/** Cuánto sigue el movimiento después de la última actividad. */
const VIDA_MS = 10_000;
const ACTIVIDAD = ["pointermove", "pointerdown", "wheel", "keydown"] as const;

/** Da el reloj a la escena y la mantiene dibujando solo mientras hay movimiento. `clave`: al cambiar, se anima de nuevo. */
export function Movimiento({ quieto, clave = "", children }: { quieto: boolean; clave?: string; children: ReactNode }) {
  const reloj = useMemo<Reloj>(() => ({ t: 0, vivo: false }), []);
  const invalidate = useThree((s) => s.invalidate);
  const hasta = useRef(0);
  useEffect(() => {
    if (quieto) { reloj.vivo = false; invalidate(); return; }
    const despertar = () => {
      hasta.current = performance.now() + VIDA_MS;
      if (!reloj.vivo) { reloj.vivo = true; invalidate(); }
    };
    despertar();
    ACTIVIDAD.forEach((e) => window.addEventListener(e, despertar, { passive: true }));
    return () => ACTIVIDAD.forEach((e) => window.removeEventListener(e, despertar));
  }, [quieto, clave, reloj, invalidate]);
  useFrame((_, delta) => {
    if (!reloj.vivo) return;
    if (performance.now() > hasta.current) { reloj.vivo = false; return; }
    reloj.t += Math.min(delta, 0.1);
    invalidate();
  });
  return <RelojContexto.Provider value={reloj}>{children}</RelojContexto.Provider>;
}

/**
 * Calidad según lo que aguante el equipo (la idea de PerformanceMonitor de drei, pero midiendo solo cuadros
 * seguidos: con dibujo a pedido hay pausas largas que no son lentitud y lo harían bajar la calidad sin motivo).
 * Si 8 de las últimas 10 muestras de 250 ms quedan bajo 40 cuadros por segundo, avisa una vez.
 */
export function Calidad({ onBaja }: { onBaja: () => void }) {
  const m = useRef({ cuadros: 0, desde: 0, muestras: [] as number[], listo: false });
  useFrame((_, delta) => {
    const a = m.current;
    if (a.listo) return;
    const ahora = performance.now();
    // después de una pausa (o de compilar sombreadores) la ventana vuelve a empezar
    if (a.cuadros === 0 || delta > 0.1) { a.cuadros = 1; a.desde = ahora; return; }
    a.cuadros++;
    if (ahora - a.desde < 250) return;
    a.muestras.push(((a.cuadros - 1) * 1000) / (ahora - a.desde));
    if (a.muestras.length > 10) a.muestras.shift();
    a.cuadros = 0;
    if (a.muestras.length === 10 && a.muestras.filter((f) => f < 40).length >= 8) { a.listo = true; onBaja(); }
  });
  return null;
}
