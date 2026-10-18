-- =====================================================================
-- Factory · Componente / modo de falla separado de la causa
--   origenes_falla  = CAUSA   (por qué falló: desgaste natural, mala operación…)
--   modos_falla     = COMPONENTE o MODO (qué falló: ruedas, hidráulico, banda…)
-- Ambos se piden al concluir la orden.
-- =====================================================================

create table public.modos_falla (
  id_modo         uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  pilares         public.pilar[],
  orden           integer not null default 100,
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, nombre),
  unique (tenant_id, id_modo)
);
create index modos_tenant_idx on public.modos_falla (tenant_id, activo, orden);
create trigger modos_tenant_inmutable before update on public.modos_falla for each row execute function private.tenant_inmutable();

alter table public.modos_falla enable row level security;
create policy modos_falla_select on public.modos_falla for select to authenticated
  using (tenant_id = (select private.tenant_actual()));
create policy modos_falla_insert on public.modos_falla for insert to authenticated
  with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')));
create policy modos_falla_update on public.modos_falla for update to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')))
  with check (tenant_id = (select private.tenant_actual()));
create policy modos_falla_delete on public.modos_falla for delete to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
revoke all on public.modos_falla from anon;

alter table public.ordenes_mantenimiento add column id_modo uuid;
alter table public.ordenes_mantenimiento
  add constraint ordenes_modo_fk foreign key (tenant_id, id_modo) references public.modos_falla (tenant_id, id_modo) on delete restrict;
create index ordenes_modo_idx on public.ordenes_mantenimiento (tenant_id, id_modo) where id_modo is not null;

-- Catálogos por defecto (se siembran al crear cada organización)
create or replace function private.sembrar_origenes(p_tenant uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.origenes_falla (tenant_id, nombre, pilares, orden) values
    (p_tenant, 'Desgaste natural',        null, 10),
    (p_tenant, 'Mala operación',          null, 20),
    (p_tenant, 'Desgaste forzado',        null, 30),
    (p_tenant, 'Falta de mantenimiento',  null, 40),
    (p_tenant, 'Diseño',                  null, 50),
    (p_tenant, 'Error humano',            null, 60),
    (p_tenant, 'Agente externo',          null, 70)
  on conflict do nothing;
  insert into public.modos_falla (tenant_id, nombre, pilares, orden) values
    (p_tenant, 'Ruedas / llantas',            '{moviles}', 10),
    (p_tenant, 'Sistema hidráulico',          '{moviles}', 20),
    (p_tenant, 'Batería / cargador',          '{moviles}', 30),
    (p_tenant, 'Frenos',                      '{moviles}', 40),
    (p_tenant, 'Tracción / transmisión',      '{moviles}', 50),
    (p_tenant, 'Mástil / horquillas',         '{moviles}', 60),
    (p_tenant, 'Banda / rodillos',            '{dorsales}', 10),
    (p_tenant, 'Motor / reductor',            '{dorsales,criticos}', 20),
    (p_tenant, 'Sensores / fotoceldas',       '{dorsales}', 30),
    (p_tenant, 'Control / PLC',               '{dorsales,criticos}', 40),
    (p_tenant, 'Estructura / guardas',        '{dorsales}', 50),
    (p_tenant, 'Respaldo de energía',         '{criticos}', 60),
    (p_tenant, 'Climatización',               '{criticos,infraestructura}', 70),
    (p_tenant, 'Hidráulico / sanitario',      '{infraestructura}', 10),
    (p_tenant, 'Obra civil / estructura',     '{infraestructura}', 20),
    (p_tenant, 'Puertas / andenes',           '{infraestructura}', 30),
    (p_tenant, 'Iluminación',                 '{infraestructura}', 40),
    (p_tenant, 'Sistema eléctrico',           null, 80),
    (p_tenant, 'Otro',                        null, 99)
  on conflict do nothing;
$$;

-- Cierre: ahora pide componente/modo además de causa
alter function public.concluir_orden(uuid, uuid, uuid, uuid, text, timestamptz) rename to zz_old2_concluir_orden;
revoke execute on function public.zz_old2_concluir_orden(uuid, uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
create function public.concluir_orden(
  p_id_orden uuid,
  p_id_origen uuid,
  p_id_modo uuid,
  p_id_almacen uuid default null,
  p_id_equipo uuid default null,
  p_notas text default null,
  p_fecha_cierre timestamptz default null
) returns public.ordenes_mantenimiento
language plpgsql security invoker set search_path = '' as $$
declare v public.ordenes_mantenimiento;
begin
  if p_id_modo is null then raise exception 'Indica el componente o modo de falla'; end if;
  update public.ordenes_mantenimiento
  set estatus_orden = 'cerrada',
      id_origen = p_id_origen,
      id_modo = p_id_modo,
      id_almacen = coalesce(p_id_almacen, id_almacen),
      id_equipo = coalesce(p_id_equipo, id_equipo),
      notas_cierre = p_notas,
      fecha_cierre = coalesce(p_fecha_cierre, now())
  where id_orden = p_id_orden and estatus_orden in ('pendiente', 'asignada', 'en_proceso')
  returning * into v;
  if v.id_orden is null then raise exception 'La orden no existe, ya está cerrada o no tienes permiso'; end if;
  return v;
end;
$$;
revoke execute on function public.concluir_orden(uuid, uuid, uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.concluir_orden(uuid, uuid, uuid, uuid, uuid, text, timestamptz) to authenticated;

-- La vista expone el nombre del componente/modo
alter view public.v_ordenes_detalle rename to zz_old2_v_ordenes_detalle;
revoke all on public.zz_old2_v_ordenes_detalle from anon, authenticated;
create view public.v_ordenes_detalle with (security_invoker = true) as
select
  o.*,
  f.nombre  as nombre_origen,
  m.nombre  as nombre_modo,
  e.nombre_equipo, e.sap_id, e.clave_id, e.estatus as estatus_equipo,
  a.nombre_almacen,
  l.nombre_linea,
  u.nombre  as nombre_asignado,
  t.zona_horaria,
  (o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as abierta,
  case when o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    then round((extract(epoch from (now() - o.fecha_ingreso)) / 3600.0)::numeric, 2)
    else o.tiempo_paro_horas end as horas_transcurridas
from public.ordenes_mantenimiento o
join public.tenants t on t.id = o.tenant_id
left join public.origenes_falla f on f.id_origen = o.id_origen
left join public.modos_falla m on m.id_modo = o.id_modo
left join public.equipos e on e.id_equipo = o.id_equipo
left join public.almacenes a on a.id_almacen = o.id_almacen
left join public.lineas_dorsales l on l.id_linea = o.id_linea
left join public.usuarios_perfiles u on u.id = o.asignado_a;
grant select on public.v_ordenes_detalle to authenticated;
revoke all on public.v_ordenes_detalle from anon;
