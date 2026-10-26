-- Equipos: la serie se separa del número SAP.
-- Hasta ahora sap_id guardaba la serie. Aquí se copia a la nueva columna serie;
-- después la carga del listado real pone en sap_id el SAP verdadero (o lo deja vacío si aún no tiene).
-- Solo agrega: las vistas ganan columnas al final, así que nada de lo existente cambia.

alter table public.equipos
  add column serie text,
  add column propiedad text not null default 'propio' check (propiedad in ('propio', 'renta', 'leasing')),
  add column modelo text,
  add column fabricante text,
  add column proveedor text;

update public.equipos set serie = sap_id where serie is null and sap_id is not null;

create unique index equipos_serie_unq on public.equipos (tenant_id, serie) where serie is not null;

create or replace view public.v_ordenes_detalle with (security_invoker = true) as
select o.id_orden, o.tenant_id, o.pilar, o.folio_ticket, o.id_equipo, o.id_linea, o.id_almacen, o.id_origen,
  o.prioridad, o.solicitante_id, o.solicitante_nombre, o.solicitante_correo, o.recibe_nombre, o.asignado_a,
  o.descripcion_falla, o.estatus_orden, o.fecha_ingreso, o.fecha_asignacion, o.fecha_inicio, o.fecha_cierre,
  o.tiempo_paro_horas, o.tiempo_respuesta_horas, o.notas_cierre, o.motivo_cancelacion, o.creado_por,
  o.cerrado_por, o.fecha_creacion, o.id_modo,
  f.nombre as nombre_origen, m.nombre as nombre_modo, e.nombre_equipo, e.sap_id, e.clave_id,
  e.estatus as estatus_equipo, a.nombre_almacen, l.nombre_linea, u.nombre as nombre_asignado, t.zona_horaria,
  o.estatus_orden = any (array['pendiente'::estatus_orden, 'asignada'::estatus_orden, 'en_proceso'::estatus_orden]) as abierta,
  case when o.estatus_orden = any (array['pendiente'::estatus_orden, 'asignada'::estatus_orden, 'en_proceso'::estatus_orden])
    then round(extract(epoch from now() - o.fecha_ingreso) / 3600.0, 2)
    else o.tiempo_paro_horas end as horas_transcurridas,
  e.serie
from ordenes_mantenimiento o
  join tenants t on t.id = o.tenant_id
  left join origenes_falla f on f.id_origen = o.id_origen
  left join modos_falla m on m.id_modo = o.id_modo
  left join equipos e on e.id_equipo = o.id_equipo
  left join almacenes a on a.id_almacen = o.id_almacen
  left join lineas_dorsales l on l.id_linea = o.id_linea
  left join usuarios_perfiles u on u.id = o.asignado_a;

create or replace view public.v_plan_equipos with (security_invoker = true) as
select pe.id, pe.tenant_id, pe.id_plan, p.nombre as plan, p.cada_dias, p.pilar, p.activo, pe.id_equipo,
  e.nombre_equipo, e.sap_id, e.id_almacen, a.nombre_almacen, pe.ultimo_servicio, pe.fecha_asignacion,
  coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias as proximo,
  coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias - (now() at time zone 'America/Mexico_City')::date as dias_restantes,
  p.tipo,
  e.serie
from plan_equipos pe
  join planes_mantenimiento p on p.id_plan = pe.id_plan
  join equipos e on e.id_equipo = pe.id_equipo
  left join almacenes a on a.id_almacen = e.id_almacen
where e.estatus <> 'baja'::estatus_equipo;
