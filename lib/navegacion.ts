/** Último pilar abierto: las páginas generales (Historial, Configuración, Usuarios) muestran su barra lateral. */
export const COOKIE_PILAR = "pilar";
/** Páginas fuera de /p/ que también llevan la barra lateral (ver app/(app)/(general)/layout.tsx). */
export const GENERALES = ["/historial", "/configuracion", "/usuarios"];
export const conBarra = (ruta: string) => ruta.startsWith("/p/") || GENERALES.some((g) => ruta === g || ruta.startsWith(g + "/"));
