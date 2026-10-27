// Constantes del home de Móviles que usan tanto el servidor (lib/home.ts) como el navegador.

/** Naves que se dibujan en la escena 3D (las de más equipos en taller). */
export const NAVES_EN_ESCENA = 6;

export const PERIODOS_HOME = [
  { v: "hoy", dias: 1, nombre: "hoy" },
  { v: "7d", dias: 7, nombre: "7 días" },
  { v: "30d", dias: 30, nombre: "30 días" },
] as const;
