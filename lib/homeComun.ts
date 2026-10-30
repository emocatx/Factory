// Constantes del home de Móviles que usan tanto el servidor (lib/home.ts) como el navegador.

/** Almacenes (los de más equipos en taller) cuyos indicadores se calculan de entrada. */
export const NAVES_EN_ESCENA = 6;

export const PERIODOS_HOME = [
  { v: "hoy", dias: 1, nombre: "hoy" },
  { v: "7d", dias: 7, nombre: "7 días" },
  { v: "30d", dias: 30, nombre: "30 días" },
] as const;

/** Separa la categoría del modelo en la clave de tipo que va a la planta 3D ("Categoría — MODELO"). */
export const SEP_CLASE = " — ";
