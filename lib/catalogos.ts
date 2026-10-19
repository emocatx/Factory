import type { EstatusOrden, Pilar, Prioridad, Rol } from "./tipos";

/** Pilares de CAB LOGISTICS (Dorsales se retiró; el valor sigue en la base por compatibilidad). */
export const PILARES: { valor: Pilar; etiqueta: string; area: string; descripcion: string }[] = [
  { valor: "moviles", etiqueta: "Móviles", area: "Logística móvil", descripcion: "Flota, disponibilidad y registros de equipos móviles." },
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
  { valor: "admin", etiqueta: "Administrador", descripcion: "Todo: usuarios, almacenes, equipos, catálogos y metas" },
  { valor: "gerente", etiqueta: "Gerente", descripcion: "Consulta indicadores, análisis e historial de todos los pilares" },
  { valor: "supervisor", etiqueta: "Supervisor", descripcion: "Registra, asigna, atiende y cierra órdenes" },
  { valor: "coordinador", etiqueta: "Coordinador", descripcion: "Registra, asigna y da seguimiento; da de alta a su equipo" },
  { valor: "tecnico", etiqueta: "Técnico", descripcion: "Registra, inicia y cierra órdenes" },
  { valor: "operaciones", etiqueta: "Operaciones", descripcion: "Levanta solicitudes y les da seguimiento" },
  { valor: "lector", etiqueta: "Solo lectura", descripcion: "Consulta tableros e historial" },
];
export const etiquetaRol = (r: Rol) => ROLES.find((x) => x.valor === r)?.etiqueta ?? r;

export const puedeAtender = (r: Rol) => r === "admin" || r === "supervisor" || r === "tecnico";
export const puedeSolicitar = (r: Rol) => r !== "lector" && r !== "gerente";
/** Almacenes, líneas, equipos, catálogos de falla y configuración: solo el administrador. */
export const puedeAdministrar = (r: Rol) => r === "admin";
/** Ve todos los pilares sin que se los asignen. */
export const veTodosLosPilares = (r: Rol) => r === "admin" || r === "gerente";
export const esAdmin = (r: Rol) => r === "admin";
/** Asignar, reasignar y cancelar órdenes. */
export const puedeAsignar = (r: Rol) => r === "admin" || r === "supervisor" || r === "coordinador";
/** Ver y administrar usuarios (el coordinador solo a su equipo). */
export const puedeGestionarUsuarios = (r: Rol) => r === "admin" || r === "coordinador";
/** Roles que cada quien puede otorgar. */
export const rolesQueOtorga = (r: Rol): Rol[] =>
  r === "admin" ? ROLES.map((x) => x.valor) : r === "coordinador" ? ["supervisor", "tecnico", "operaciones", "lector"] : [];

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
    ...(puedeSolicitar(rol) ? [{ href: `${base}/registro`, texto: "Registro" }] : []),
    { href: `${base}/indicadores`, texto: "Indicadores" },
    { href: `${base}/analisis`, texto: "Análisis de falla" },
    { href: `${base}/cerradas`, texto: "Cerradas" },
  ];
  if (puedeAdministrar(rol)) t.push({ href: `${base}/equipos`, texto: "Equipos" });
  return t;
}
