-- Tipo de plan (preventivo, inspección o proveedor). Los de proveedor pueden ir sin frecuencia:
-- "lo define el proveedor", sin próxima fecha ni seguimiento de ciclo.
alter table public.planes_mantenimiento
  add column tipo text not null default 'preventivo' check (tipo in ('preventivo', 'inspeccion', 'proveedor')),
  alter column cada_dias drop not null,
  add constraint planes_frecuencia check (cada_dias is not null or tipo = 'proveedor');

-- Misma vista con el tipo al final (proximo y dias_restantes quedan en null sin frecuencia).
create or replace view public.v_plan_equipos with (security_invoker = true) as
select pe.id, pe.tenant_id, pe.id_plan, p.nombre as plan, p.cada_dias, p.pilar, p.activo,
       pe.id_equipo, e.nombre_equipo, e.sap_id, e.id_almacen, a.nombre_almacen,
       pe.ultimo_servicio, pe.fecha_asignacion,
       coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias as proximo,
       coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias - (now() at time zone 'America/Mexico_City')::date as dias_restantes,
       p.tipo
from public.plan_equipos pe
join public.planes_mantenimiento p on p.id_plan = pe.id_plan
join public.equipos e on e.id_equipo = pe.id_equipo
left join public.almacenes a on a.id_almacen = e.id_almacen
where e.estatus <> 'baja';
