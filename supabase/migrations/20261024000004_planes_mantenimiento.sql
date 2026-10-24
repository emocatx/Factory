-- Planes de mantenimiento preventivo: un plan (servicio + frecuencia + tareas) se asigna a muchos
-- equipos. El próximo servicio se calcula solo: último servicio + cada_dias (sin último, desde la
-- asignación). La carga es por Excel (ida y vuelta) o seleccionando equipos en la app.

create table public.planes_mantenimiento (
  id_plan uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.tenant_actual() references public.tenants(id) on delete cascade,
  pilar public.pilar not null,
  nombre text not null check (length(trim(nombre)) between 2 and 80),
  cada_dias integer not null check (cada_dias between 1 and 3650),
  tareas text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  unique (tenant_id, id_plan)
);
create unique index planes_nombre_unq on public.planes_mantenimiento (tenant_id, pilar, lower(trim(nombre)));

create table public.plan_equipos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.tenant_actual() references public.tenants(id) on delete cascade,
  id_plan uuid not null,
  id_equipo uuid not null,
  ultimo_servicio date,
  fecha_asignacion date not null default (now() at time zone 'America/Mexico_City')::date,
  unique (id_plan, id_equipo),
  foreign key (tenant_id, id_plan) references public.planes_mantenimiento (tenant_id, id_plan) on delete cascade,
  foreign key (tenant_id, id_equipo) references public.equipos (tenant_id, id_equipo) on delete cascade
);
create index plan_equipos_equipo_idx on public.plan_equipos (tenant_id, id_equipo);

alter table public.planes_mantenimiento enable row level security;
alter table public.plan_equipos enable row level security;

create policy planes_select on public.planes_mantenimiento for select to authenticated
  using (tenant_id = (select private.tenant_actual()) and pilar = any ((select private.pilares_actuales())::public.pilar[]));
create policy planes_escribir on public.planes_mantenimiento for all to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor,coordinador}')))
  with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor,coordinador}'))
              and pilar = any ((select private.pilares_actuales())::public.pilar[]));

create policy plan_equipos_select on public.plan_equipos for select to authenticated
  using (tenant_id = (select private.tenant_actual()));
create policy plan_equipos_escribir on public.plan_equipos for all to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor,coordinador}')))
  with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor,coordinador}')));

grant select, insert, update, delete on public.planes_mantenimiento, public.plan_equipos to authenticated;

-- Próximo servicio calculado; security_invoker para que aplique la RLS de quien consulta.
create view public.v_plan_equipos with (security_invoker = true) as
select pe.id, pe.tenant_id, pe.id_plan, p.nombre as plan, p.cada_dias, p.pilar, p.activo,
       pe.id_equipo, e.nombre_equipo, e.sap_id, e.id_almacen, a.nombre_almacen,
       pe.ultimo_servicio, pe.fecha_asignacion,
       coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias as proximo,
       coalesce(pe.ultimo_servicio, pe.fecha_asignacion) + p.cada_dias - (now() at time zone 'America/Mexico_City')::date as dias_restantes
from public.plan_equipos pe
join public.planes_mantenimiento p on p.id_plan = pe.id_plan
join public.equipos e on e.id_equipo = pe.id_equipo
left join public.almacenes a on a.id_almacen = e.id_almacen
where e.estatus <> 'baja';
grant select on public.v_plan_equipos to authenticated;
