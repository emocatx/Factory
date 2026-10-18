import type { EstatusOrden, Pilar, Prioridad, Rol } from "./tipos";

export const PILARES: { valor: Pilar; etiqueta: string; area: string; descripcion: string }[] = [
  { valor: "moviles", etiqueta: "Móviles", area: "Logística móvil", descripcion: "Flota, disponibilidad y registros de equipos móviles." },
  { valor: "dorsales", etiqueta: "Dorsales", area: "Dorsales", descripcion: "Transportadores entre almacenes: solicitudes por línea y folio." },
  { valor: "criticos", etiqueta: "Críticos", area: "Sistemas críticos", descripcion: "Sistemas críticos y activos de alto impacto." },
  { valor: "infraestructura", etiqueta: "Infraestructura", area: "Infraestructura", descripcion: "Infraestructura, servicios y órdenes de inmuebles." },
];

export const esPilar = (v: string): v is Pilar => PILARES.some((p) => p.valor === v);
export const infoPilar = (p: Pilar) => PILARES.find((x) => x.valor === p)!;
export const etiquetaPilar = (p: Pilar) => infoPilar(p).etiqueta;

export const ESTADOS: Record<EstatusOrden, { etiqueta: string; clase: string }> = {
  pendiente:  { etiqueta: "Pendiente",  clase: "bg-alerta-suave text-alerta-texto" },
  asignada:   { etiqueta: "Asignada",   clase: "bg-info-suave text-info-texto" },
  en_proceso: { etiqueta: "En proceso", clase: "bg-tinta text-white" },
  cerrada:    { etiqueta: "Cerrada",    clase: "bg-ok-suave text-ok-texto" },
  cancelada:  { etiqueta: "Cancelada",  clase: "bg-panel text-suave" },
};
export const ESTADOS_ABIERTOS: EstatusOrden[] = ["pendiente", "asignada", "en_proceso"];

export const PRIORIDADES: { valor: Prioridad; etiqueta: string }[] = [
  { valor: "alta", etiqueta: "Alta" },
  { valor: "media", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
];

export const ROLES: { valor: Rol; etiqueta: string; descripcion: string }[] = [
  { valor: "admin", etiqueta: "Administrador", descripcion: "Todo, incluidos usuarios y configuración" },
  { valor: "supervisor", etiqueta: "Supervisor", descripcion: "Atiende órdenes y administra catálogos" },
  { valor: "tecnico", etiqueta: "Técnico", descripcion: "Registra, inicia y cierra órdenes" },
  { valor: "operaciones", etiqueta: "Operaciones", descripcion: "Levanta solicitudes y les da seguimiento" },
  { valor: "lector", etiqueta: "Solo lectura", descripcion: "Consulta tableros e historial" },
];
export const etiquetaRol = (r: Rol) => ROLES.find((x) => x.valor === r)?.etiqueta ?? r;

export const puedeAtender = (r: Rol) => r === "admin" || r === "supervisor" || r === "tecnico";
export const puedeSolicitar = (r: Rol) => r !== "lector";
export const puedeAdministrar = (r: Rol) => r === "admin" || r === "supervisor";
export const esAdmin = (r: Rol) => r === "admin";

/** Pestañas de un pilar según el rol (Operaciones ve su propio espacio, como en la app de Power Apps). */
export function pestanasPilar(pilar: Pilar, rol: Rol) {
  const base = `/p/${pilar}`;
  if (rol === "operaciones") {
    return [
      { href: `${base}/ordenes`, texto: "Seguimiento" },
      { href: `${base}/registro`, texto: "Nueva solicitud" },
      { href: `${base}/cerradas`, texto: "Cerradas" },
    ];
  }
  const t = [
    { href: `${base}/ordenes`, texto: "Órdenes abiertas" },
    { href: `${base}/resumen`, texto: "Resumen de órdenes" },
    ...(rol !== "lector" ? [{ href: `${base}/registro`, texto: "Registro" }] : []),
    { href: `${base}/indicadores`, texto: "Indicadores" },
    { href: `${base}/analisis`, texto: "Análisis de falla" },
    { href: `${base}/cerradas`, texto: "Cerradas" },
  ];
  if (puedeAdministrar(rol)) t.push({ href: `${base}/equipos`, texto: "Equipos" });
  return t;
}
