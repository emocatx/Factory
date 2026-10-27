export type Pilar = "moviles" | "dorsales" | "criticos" | "infraestructura";
export type Rol = "admin" | "gerente" | "supervisor" | "coordinador" | "tecnico" | "operaciones" | "lector";
export type EstatusEquipo = "activo" | "en_paro" | "baja";
export type EstatusOrden = "pendiente" | "asignada" | "en_proceso" | "cerrada" | "cancelada";
export type Prioridad = "baja" | "media" | "alta";

export interface Perfil {
  id: string;
  tenant_id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  pilares: Pilar[];
  activo: boolean;
}

export interface Tenant {
  id: string;
  nombre_empresa: string;
  zona_horaria: string;
  pilares_activos: Pilar[];
  meta_mttr_horas: number;
  meta_mtbf_horas: number | null;
  meta_disponibilidad_pct: number;
}

export interface Sesion {
  perfil: Perfil;
  tenant: Tenant;
  /** Pilares que este usuario puede abrir (admin: todos los activos del tenant) */
  pilares: Pilar[];
  /** Ya vio el recorrido de bienvenida (se guarda en user_metadata de Supabase Auth). */
  tourVisto: boolean;
}

export interface Almacen { id_almacen: string; nombre_almacen: string; activo: boolean }
export interface Linea { id_linea: string; nombre_linea: string; activo: boolean }
export interface Origen { id_origen: string; nombre: string; pilares: Pilar[] | null; orden: number; activo: boolean }
/** Componente o modo de falla (qué falló), separado de la causa (por qué). */
export interface Modo { id_modo: string; nombre: string; pilares: Pilar[] | null; orden: number; activo: boolean }

export type TipoPlan = "preventivo" | "inspeccion" | "proveedor";
/** Plan de mantenimiento: servicio con frecuencia en días (los de proveedor pueden no tenerla), asignable a muchos equipos. */
export interface PlanMantenimiento { id_plan: string; pilar: Pilar; nombre: string; tipo: TipoPlan; cada_dias: number | null; tareas: string | null; activo: boolean }
/** Asignación plan–equipo con el próximo servicio ya calculado (vista v_plan_equipos; null sin frecuencia). */
export interface PlanEquipo {
  id: string; id_plan: string; plan: string; tipo: TipoPlan; cada_dias: number | null; id_equipo: string; nombre_equipo: string; sap_id: string | null; serie: string | null;
  id_almacen: string | null; nombre_almacen: string | null; ultimo_servicio: string | null; proximo: string | null; dias_restantes: number | null;
}

export type Propiedad = "propio" | "renta" | "leasing";

export interface Equipo {
  id_equipo: string;
  id_almacen: string;
  id_linea: string | null;
  /** Número SAP real; vacío mientras el equipo no lo tenga. */
  sap_id: string | null;
  /** Serie del fabricante: siempre viene y es la llave para cruzar el listado. */
  serie: string | null;
  clave_id: string | null;
  propiedad: Propiedad;
  modelo: string | null;
  fabricante: string | null;
  proveedor: string | null;
  nombre_equipo: string;
  tipo_pilar: Pilar;
  estatus: EstatusEquipo;
}

export interface OrdenDetalle {
  id_orden: string;
  pilar: Pilar;
  folio_ticket: string;
  id_equipo: string | null;
  id_linea: string | null;
  id_almacen: string | null;
  id_origen: string | null;
  id_modo: string | null;
  prioridad: Prioridad;
  solicitante_id: string | null;
  solicitante_nombre: string;
  solicitante_correo: string | null;
  recibe_nombre: string | null;
  asignado_a: string | null;
  descripcion_falla: string;
  estatus_orden: EstatusOrden;
  fecha_ingreso: string;
  fecha_asignacion: string | null;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  tiempo_paro_horas: number | null;
  tiempo_respuesta_horas: number | null;
  notas_cierre: string | null;
  motivo_cancelacion: string | null;
  nombre_origen: string | null;
  nombre_modo: string | null;
  nombre_equipo: string | null;
  sap_id: string | null;
  serie: string | null;
  estatus_equipo: EstatusEquipo | null;
  nombre_almacen: string | null;
  nombre_linea: string | null;
  nombre_asignado: string | null;
  abierta: boolean;
  horas_transcurridas: number | null;
}

export interface Indicadores {
  activos_evaluados: number;
  ingresos: number;
  cerradas: number;
  en_paro: number;
  horas_periodo: number;
  horas_base: number;
  horas_paro: number;
  horas_paro_cerradas: number;
  horas_operativas: number;
  mttr_horas: number | null;
  mtbf_horas: number | null;
  disponibilidad_pct: number | null;
  meta_mttr_horas: number | null;
  meta_mtbf_horas: number | null;
  meta_disponibilidad_pct: number | null;
}

export interface TopFalla {
  id_equipo: string | null;
  id_linea: string | null;
  nombre: string;
  sap_id: string | null;
  nombre_linea: string | null;
  fallas: number;
  pct: number;
  horas_paro: number;
}

export interface DistOrigen { id_origen: string | null; nombre: string; fallas: number; pct: number; horas_paro: number }

export interface ResumenOrdenes {
  abiertas: number;
  pendientes: number;
  en_proceso: number;
  cerradas: number;
  ingresos_hoy: number;
  cierres_hoy: number;
  mttr_horas: number | null;
  abierta_mas_antigua: string | null;
}

export interface SaludLinea {
  id_linea: string;
  nombre_linea: string;
  carga_abierta: number;
  cierres_historicos: number;
  total_ordenes: number;
  pct_salud: number;
  mttr_horas: number | null;
  abierta_mas_antigua: string | null;
}

export interface DisponibilidadAlmacen {
  id_almacen: string;
  nombre_almacen: string;
  tipo_pilar: Pilar;
  total_equipos: number;
  equipos_parados: number;
  equipos_disponibles: number;
  pct_disponibilidad: number | null;
}

export interface PuntoTendencia { periodo: string; ingresadas: number; cerradas: number }

export interface EventoBitacora {
  id: number;
  pilar: Pilar | null;
  tabla: string;
  registro_id: string;
  accion: string;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
  usuario_id: string | null;
  fecha: string;
}
