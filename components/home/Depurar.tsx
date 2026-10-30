"use client";

// Solo en desarrollo: deja el estado de la escena en `window.__planta3d` para medir desde la consola
// (renderer.info: llamadas de dibujo, triángulos, geometrías y texturas) y contar cuántos cuadros dibuja,
// así se ve si redibuja en reposo. Quien lo monta lo hace detrás de `process.env.NODE_ENV !== "production"`,
// así que en producción no existe.
import { useEffect } from "react";
import { useFrame, useThree, type RootState } from "@react-three/fiber";

type Expuesto = { estado: () => RootState; cuadros: number };

export function Depurar() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = window as unknown as { __planta3d?: Expuesto };
    const api: Expuesto = { estado: get, cuadros: 0 };
    w.__planta3d = api;
    return () => { if (w.__planta3d === api) delete w.__planta3d; };
  }, [get]);
  // no pide cuadros: solo cuenta los que la escena dibuja de todos modos
  useFrame(() => {
    const api = (window as unknown as { __planta3d?: Expuesto }).__planta3d;
    if (api) api.cuadros++;
  });
  return null;
}
