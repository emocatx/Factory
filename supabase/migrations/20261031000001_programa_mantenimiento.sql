-- Programa de mantenimiento preventivo: cada fecha programada de cada plan en cada equipo es una fila con su
-- estatus (programado → asignado → en ejecución → completado, o reprogramado / no realizado), su responsable y la
-- fecha en que se hizo. Hasta hoy el calendario semanal del programa anual (≈6,189 fechas de Inmueble en 2026) solo
-- se usaba para calcular la primera fecha de cada asignación; desde aquí se guarda completo.
--
-- · Lectura: quien ve el pilar y el almacén del equipo. Escritura directa: admin, supervisor y coordinador.
-- · El técnico solo cambia el estatus de lo asignado a él, con cambiar_estatus_programa.
-- · asignar_programa / cambiar_estatus_programa: la puerta pública es security invoker y llama a la versión de
--   private (security definer, fuera de la API), que valida rol, empresa, pilar y almacén adentro.
-- · Completar un servicio recorre plan_equipos.ultimo_servicio, así el próximo calculado sigue cuadrando.
-- · cargar_programa_anual acepta p_datos -> 'programa' ([{i, n, f}]) y guarda esas fechas (repetible sin duplicar).

-- 1. Tabla ────────────────────────────────────────────────────────────────────────────────────────
create table public.programa_mantenimiento (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default private.tenant_actual() references public.tenants(id) on delete cascade,
  pilar            public.pilar not null,
  id_plan          uuid not null,
  id_equipo        uuid not null,
  fecha_programada date not null,
  fecha_original   date,                -- la fecha del programa cuando se reprograma (se guarda la primera vez)
  estatus          text not null default 'programado'
                   check (estatus in ('programado', 'asignado', 'en_ejecucion', 'completado', 'reprogramado', 'no_realizado')),
  id_responsable   uuid,
  fecha_realizada  date,
  motivo           text check (motivo is null or length(motivo) <= 300),
  origen           text not null default 'manual' check (origen in ('programa-anual', 'manual')),
  actualizado_por  uuid default auth.uid(),
  actualizado_en   timestamptz not null default now(),
  constraint programa_completado_con_fecha check (estatus <> 'completado' or fecha_realizada is not null),
  constraint programa_unq unique (tenant_id, id_plan, id_equipo, fecha_programada),
  foreign key (tenant_id, id_plan) references public.planes_mantenimiento (tenant_id, id_plan) on delete cascade,
  foreign key (tenant_id, id_equipo) references public.equipos (tenant_id, id_equipo) on delete cascade,
  -- el responsable es una persona de la misma empresa; si se borra, el servicio queda sin responsable
  foreign key (tenant_id, id_responsable) references public.usuarios_perfiles (tenant_id, id) on delete set null (id_responsable)
);
create index programa_pilar_fecha_idx on public.programa_mantenimiento (tenant_id, pilar, fecha_programada);
create index programa_responsable_idx on public.programa_mantenimiento (tenant_id, id_responsable, fecha_programada);
create index programa_equipo_idx on public.programa_mantenimiento (tenant_id, id_equipo);

-- Quién y cuándo cambió la fila; la empresa no cambia.
create or replace function private.programa_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce((select auth.uid()), new.actualizado_por);
  return new;
end;
$$;
revoke all on function private.programa_actualizado() from public;

create trigger programa_tenant_inmutable before update on public.programa_mantenimiento
  for each row execute function private.tenant_inmutable();
create trigger programa_actualizado before update on public.programa_mantenimiento
  for each row execute function private.programa_actualizado();

-- 2. Reglas de acceso (RLS) ───────────────────────────────────────────────────────────────────────
-- Una política por acción (sin "for all") para no tener dos políticas de lectura.
alter table public.programa_mantenimiento enable row level security;

create policy programa_select on public.programa_mantenimiento for select to authenticated using (
  tenant_id = (select private.tenant_actual())
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

create policy programa_insert on public.programa_mantenimiento for insert to authenticated with check (
  tenant_id = (select private.tenant_actual())
  and (select private.tiene_rol('{admin,supervisor,coordinador}'))
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and exists (select 1 from public.planes_mantenimiento p where p.id_plan = programa_mantenimiento.id_plan and p.pilar = programa_mantenimiento.pilar)
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

create policy programa_update on public.programa_mantenimiento for update to authenticated using (
  tenant_id = (select private.tenant_actual())
  and (select private.tiene_rol('{admin,supervisor,coordinador}'))
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
) with check (
  tenant_id = (select private.tenant_actual())
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and exists (select 1 from public.planes_mantenimiento p where p.id_plan = programa_mantenimiento.id_plan and p.pilar = programa_mantenimiento.pilar)
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

create policy programa_delete on public.programa_mantenimiento for delete to authenticated using (
  tenant_id = (select private.tenant_actual())
  and (select private.tiene_rol('{admin,supervisor,coordinador}'))
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

grant select, insert, update, delete on public.programa_mantenimiento to authenticated;

-- 3. Asignar responsable ──────────────────────────────────────────────────────────────────────────
-- El responsable es un técnico o supervisor activo de la empresa, con el pilar del servicio y, si la empresa
-- trabaja con alcance por almacén, con el almacén del equipo. Pasa a "asignado" lo programado o reprogramado;
-- lo ya asignado cambia de responsable. Lo que está en ejecución, completado o no realizado no se toca.
create or replace function private.asignar_programa(p_ids uuid[], p_responsable uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_tenant  uuid := (select private.tenant_actual());
  v_pilares public.pilar[] := (select private.pilares_actuales());
  v_alm     uuid[] := (select private.almacenes_actuales());
  v_hoy     date := (now() at time zone 'America/Mexico_City')::date;
  v_resp    public.usuarios_perfiles;
  v_alcance boolean;
  v_n       integer;
begin
  if v_tenant is null or not (select private.tiene_rol('{admin,supervisor,coordinador}')) then
    raise exception 'No tienes permiso para asignar el programa' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Elige al menos un servicio' using errcode = '22023'; end if;
  if cardinality(p_ids) > 2000 then raise exception 'Demasiados servicios en una sola asignación' using errcode = '22023'; end if;

  select u.* into v_resp from public.usuarios_perfiles u
  where u.id = p_responsable and u.tenant_id = v_tenant and u.activo and u.rol in ('tecnico', 'supervisor');
  if v_resp.id is null then
    raise exception 'El responsable debe ser un técnico o supervisor activo de la empresa' using errcode = '22023';
  end if;
  select coalesce(t.alcance_por_almacen, false) into v_alcance from public.tenants t where t.id = v_tenant;

  update public.programa_mantenimiento pm
  set id_responsable = v_resp.id, estatus = 'asignado'
  from public.equipos e
  where pm.id = any (p_ids)
    and pm.tenant_id = v_tenant
    and e.tenant_id = v_tenant and e.id_equipo = pm.id_equipo
    and pm.pilar = any (v_pilares)
    and pm.pilar = any (v_resp.pilares)
    and (v_alm is null or e.id_almacen = any (v_alm))
    and (not v_alcance or v_resp.todos_almacenes or exists (
      select 1 from public.usuarios_almacenes ua
      where ua.usuario_id = v_resp.id and ua.almacen_id = e.id_almacen and (ua.vigente_hasta is null or ua.vigente_hasta >= v_hoy)))
    and pm.estatus in ('programado', 'reprogramado', 'asignado');
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ninguno de esos servicios se puede asignar a esa persona' using errcode = 'FA002';
  end if;
  return v_n;
end;
$$;

-- 4. Cambiar estatus ──────────────────────────────────────────────────────────────────────────────
-- · completado: fecha realizada (hoy CDMX si no viene; no futura) y recorre plan_equipos.ultimo_servicio.
-- · reprogramado: nueva fecha (hoy o después) y motivo; la fecha del programa queda en fecha_original.
-- · no_realizado: motivo. · en_ejecucion: sin datos. · programado: deshacer (solo editores; suelta al responsable).
-- Editores (admin, supervisor, coordinador): cualquier servicio de su pilar y almacén. Técnico: solo lo asignado
-- a él que siga abierto (asignado, en ejecución o reprogramado).
create or replace function private.cambiar_estatus_programa(p_ids uuid[], p_estatus text, p_fecha date, p_motivo text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_tenant  uuid := (select private.tenant_actual());
  v_rol     public.rol_usuario := (select private.rol_actual());
  v_pilares public.pilar[] := (select private.pilares_actuales());
  v_alm     uuid[] := (select private.almacenes_actuales());
  v_hoy     date := (now() at time zone 'America/Mexico_City')::date;
  v_editor  boolean;
  v_motivo  text := nullif(trim(p_motivo), '');
  v_fecha   date;
  v_n       integer;
begin
  if v_tenant is null or v_rol is null or v_rol not in ('admin', 'supervisor', 'coordinador', 'tecnico') then
    raise exception 'No tienes permiso para cambiar el programa' using errcode = '42501';
  end if;
  v_editor := v_rol in ('admin', 'supervisor', 'coordinador');
  if coalesce(cardinality(p_ids), 0) = 0 then raise exception 'Elige al menos un servicio' using errcode = '22023'; end if;
  if cardinality(p_ids) > 2000 then raise exception 'Demasiados servicios en un solo cambio' using errcode = '22023'; end if;
  if p_estatus is null or p_estatus not in ('programado', 'en_ejecucion', 'completado', 'reprogramado', 'no_realizado') then
    raise exception 'Estatus inválido' using errcode = '22023';
  end if;
  if p_estatus = 'programado' and not v_editor then
    raise exception 'Solo un supervisor, coordinador o administrador puede regresar un servicio a programado' using errcode = '42501';
  end if;
  if length(v_motivo) > 300 then raise exception 'El motivo es demasiado largo (máximo 300 caracteres)' using errcode = '22023'; end if;

  if p_estatus = 'completado' then
    v_fecha := coalesce(p_fecha, v_hoy);
    if v_fecha > v_hoy then raise exception 'La fecha de realización no puede ser futura' using errcode = '22023'; end if;
  elsif p_estatus = 'reprogramado' then
    if p_fecha is null then raise exception 'Indica la nueva fecha' using errcode = '22023'; end if;
    if p_fecha < v_hoy then raise exception 'La nueva fecha no puede ser anterior a hoy' using errcode = '22023'; end if;
    if v_motivo is null then raise exception 'Indica el motivo de la reprogramación' using errcode = '22023'; end if;
  elsif p_estatus = 'no_realizado' and v_motivo is null then
    raise exception 'Indica por qué no se realizó' using errcode = '22023';
  end if;

  with f as (
    select pm.id
    from public.programa_mantenimiento pm
    join public.equipos e on e.tenant_id = pm.tenant_id and e.id_equipo = pm.id_equipo
    where pm.id = any (p_ids)
      and pm.tenant_id = v_tenant
      and pm.pilar = any (v_pilares)
      and (v_alm is null or e.id_almacen = any (v_alm))
      and (v_editor or (pm.id_responsable = v_uid and pm.estatus in ('asignado', 'en_ejecucion', 'reprogramado')))
    for update of pm
  ), u as (
    update public.programa_mantenimiento pm set
      estatus          = p_estatus,
      fecha_realizada  = case when p_estatus = 'completado' then v_fecha end,
      fecha_original   = case when p_estatus = 'reprogramado' then coalesce(pm.fecha_original, pm.fecha_programada) else pm.fecha_original end,
      fecha_programada = case when p_estatus = 'reprogramado' then p_fecha else pm.fecha_programada end,
      motivo           = case when p_estatus in ('reprogramado', 'no_realizado') then v_motivo else coalesce(v_motivo, pm.motivo) end,
      id_responsable   = case when p_estatus = 'programado' then null else pm.id_responsable end
    from f
    where pm.id = f.id
    returning pm.tenant_id, pm.id_plan, pm.id_equipo
  ), pe as (
    update public.plan_equipos x
    set ultimo_servicio = greatest(x.ultimo_servicio, v_fecha)
    from (select distinct u.tenant_id, u.id_plan, u.id_equipo from u) d
    where p_estatus = 'completado'
      and x.tenant_id = d.tenant_id and x.id_plan = d.id_plan and x.id_equipo = d.id_equipo
    returning 1
  )
  select count(*) into v_n from u;

  if v_n = 0 then
    raise exception 'No puedes cambiar estos servicios' using errcode = 'FA002';
  end if;
  return v_n;
end;
$$;

revoke all on function private.asignar_programa(uuid[], uuid) from public, anon;
revoke all on function private.cambiar_estatus_programa(uuid[], text, date, text) from public, anon;
grant execute on function private.asignar_programa(uuid[], uuid) to authenticated;
grant execute on function private.cambiar_estatus_programa(uuid[], text, date, text) to authenticated;

-- Puertas públicas (RPC): no saltan la RLS por sí mismas; toda la validación vive en private.
create or replace function public.asignar_programa(p_ids uuid[], p_responsable uuid)
returns integer language sql set search_path = '' as $$
  select private.asignar_programa(p_ids, p_responsable)
$$;
create or replace function public.cambiar_estatus_programa(p_ids uuid[], p_estatus text, p_fecha date default null, p_motivo text default null)
returns integer language sql set search_path = '' as $$
  select private.cambiar_estatus_programa(p_ids, p_estatus, p_fecha, p_motivo)
$$;
revoke all on function public.asignar_programa(uuid[], uuid) from public, anon;
revoke all on function public.cambiar_estatus_programa(uuid[], text, date, text) from public, anon;
grant execute on function public.asignar_programa(uuid[], uuid) to authenticated;
grant execute on function public.cambiar_estatus_programa(uuid[], text, date, text) to authenticated;

-- 5. Vista ────────────────────────────────────────────────────────────────────────────────────────
-- security_invoker: aplica la RLS de quien consulta. Semanas ISO (lunes a domingo), hoy en CDMX.
-- · fecha_plan: la fecha que decía el programa (la original si se reprogramó); con ella se mide el cumplimiento.
-- · vencido: sigue abierto y su fecha es de una semana anterior a la actual.
-- · a_tiempo: completado a más tardar el domingo de la semana de su fecha_plan (antes también cuenta).
create view public.v_programa with (security_invoker = true) as
select pm.id, pm.tenant_id, pm.pilar, pm.id_plan, pm.id_equipo,
       pm.fecha_programada, pm.fecha_original, coalesce(pm.fecha_original, pm.fecha_programada) as fecha_plan,
       pm.estatus, pm.id_responsable, u.nombre as responsable, pm.fecha_realizada, pm.motivo, pm.origen,
       pm.actualizado_por, pm.actualizado_en,
       e.nombre_equipo, e.sap_id, e.clave_id, e.categoria, e.id_almacen, a.nombre_almacen,
       p.nombre as plan, p.cada_dias,
       extract(isoyear from pm.fecha_programada)::int as anio_iso,
       extract(week from pm.fecha_programada)::int as semana_iso,
       (pm.estatus not in ('completado', 'no_realizado')
         and pm.fecha_programada < date_trunc('week', (now() at time zone 'America/Mexico_City'))::date) as vencido,
       (pm.estatus = 'completado'
         and pm.fecha_realizada <= date_trunc('week', coalesce(pm.fecha_original, pm.fecha_programada))::date + 6) as a_tiempo
from public.programa_mantenimiento pm
join public.equipos e on e.id_equipo = pm.id_equipo
join public.planes_mantenimiento p on p.id_plan = pm.id_plan
left join public.almacenes a on a.id_almacen = e.id_almacen
left join public.usuarios_perfiles u on u.id = pm.id_responsable
where e.estatus <> 'baja';
grant select on public.v_programa to authenticated;

-- 6. Métricas ─────────────────────────────────────────────────────────────────────────────────────
-- security invoker (lee v_programa con la RLS de quien consulta). Periodo por fecha_plan:
--   programados = con fecha_plan hasta hoy; completados, a_tiempo, reprogramados y no_realizados de esos;
--   vencidos = abiertos de semanas anteriores; total = todo el periodo (también lo que falta).
-- semana y mes = la semana ISO y el mes actuales, por fecha_programada (sin importar el periodo).
create or replace function public.resumen_programa(
  p_pilar public.pilar, p_desde date, p_hasta date, p_almacen uuid default null, p_responsable uuid default null)
returns jsonb language sql stable set search_path = '' as $$
  with hoy as (
    select (now() at time zone 'America/Mexico_City')::date as d,
           date_trunc('week', (now() at time zone 'America/Mexico_City'))::date as lunes,
           date_trunc('month', (now() at time zone 'America/Mexico_City'))::date as mes
  ), base as (
    select v.*
    from public.v_programa v
    where v.pilar = p_pilar
      and (p_almacen is null or v.id_almacen = p_almacen)
      and (p_responsable is null or v.id_responsable is not distinct from p_responsable)
  ), r as (
    select b.*, b.fecha_plan <= (select d from hoy) as a_la_fecha
    from base b where b.fecha_plan between p_desde and p_hasta
  ), m as (
    select r.id_almacen, r.nombre_almacen, r.id_responsable, r.responsable,
           grouping(r.id_almacen) as g_alm, grouping(r.id_responsable) as g_resp,
           count(*) filter (where r.a_la_fecha) as programados,
           count(*) filter (where r.a_la_fecha and r.estatus = 'completado') as completados,
           count(*) filter (where r.a_la_fecha and r.a_tiempo) as a_tiempo,
           count(*) filter (where r.vencido) as vencidos,
           count(*) filter (where r.a_la_fecha and r.fecha_original is not null) as reprogramados,
           count(*) filter (where r.a_la_fecha and r.estatus = 'no_realizado') as no_realizados,
           count(*) as total
    from r
    group by grouping sets ((), (r.id_almacen, r.nombre_almacen), (r.id_responsable, r.responsable))
  ), avance as (
    select count(*) filter (where b.fecha_programada between h.lunes and h.lunes + 6) as semana_total,
           count(*) filter (where b.fecha_programada between h.lunes and h.lunes + 6 and b.estatus = 'completado') as semana_completados,
           count(*) filter (where b.fecha_programada >= h.mes and b.fecha_programada < (h.mes + interval '1 month')::date) as mes_total,
           count(*) filter (where b.fecha_programada >= h.mes and b.fecha_programada < (h.mes + interval '1 month')::date
                              and b.estatus = 'completado') as mes_completados
    from base b cross join hoy h
    where b.fecha_programada between least(h.lunes, h.mes) and greatest(h.lunes + 6, (h.mes + interval '1 month')::date)
  )
  select jsonb_build_object(
    'hoy', (select d from hoy),
    'totales', coalesce((select to_jsonb(x) - '{id_almacen,nombre_almacen,id_responsable,responsable,g_alm,g_resp}'::text[]
                         from m x where x.g_alm = 1 and x.g_resp = 1), '{}'::jsonb),
    'por_almacen', coalesce((select jsonb_agg(to_jsonb(x) - '{id_responsable,responsable,g_alm,g_resp}'::text[] order by x.nombre_almacen)
                             from m x where x.g_alm = 0), '[]'::jsonb),
    'por_responsable', coalesce((select jsonb_agg(to_jsonb(x) - '{id_almacen,nombre_almacen,g_alm,g_resp}'::text[] order by x.responsable nulls first)
                                 from m x where x.g_resp = 0), '[]'::jsonb),
    'semana', (select jsonb_build_object('total', a.semana_total, 'completados', a.semana_completados) from avance a),
    'mes', (select jsonb_build_object('total', a.mes_total, 'completados', a.mes_completados) from avance a)
  )
$$;
revoke all on function public.resumen_programa(public.pilar, date, date, uuid, uuid) from public, anon;
grant execute on function public.resumen_programa(public.pilar, date, date, uuid, uuid) to authenticated;

-- 7. Carga del programa anual con sus fechas ──────────────────────────────────────────────────────
-- Igual que en 20261029000001, más p_datos -> 'programa': [{i, n, f}] (i = índice del activo en la carga, n = nombre
-- del plan, f = fecha programada). Solo se guardan fechas de asignaciones que existen (plan + equipo). Repetible: no
-- duplica una fecha que ya está, ni una que ya se reprogramó a otro día (fecha_original). Sin 'programa', como antes.
create or replace function public.cargar_programa_anual(p_pilar pilar, p_datos jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_ids jsonb;
  v_ins int; v_upd int; v_ajeno int; v_planes int; v_asig int; v_fichas int; v_prog int;
  v_resumen jsonb;
begin
  if not (select private.tiene_rol('{admin}')) then
    raise exception 'Solo el administrador puede cargar el programa anual' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos -> 'activos') is distinct from 'array' or jsonb_array_length(p_datos -> 'activos') = 0 then
    raise exception 'El programa no trae activos';
  end if;
  if jsonb_array_length(p_datos -> 'activos') > 20000 then
    raise exception 'Demasiados activos para una sola carga';
  end if;
  if p_datos ? 'programa' and jsonb_typeof(p_datos -> 'programa') is distinct from 'array' then
    raise exception 'Las fechas programadas no tienen el formato esperado';
  end if;
  if jsonb_array_length(coalesce(p_datos -> 'programa', '[]'::jsonb)) > 100000 then
    raise exception 'Demasiadas fechas programadas para una sola carga';
  end if;
  perform set_config('factory.carga_masiva', '1', true);

  with a as materialized (
    select x.i, x.alm, nullif(trim(x.sap), '') as sap,
           coalesce(nullif(left(trim(x.clave), 40), ''),
                    case when x.cons is not null then upper(left(p_pilar::text, 3)) || '-' || x.cons end) as clave,
           trim(x.nombre) as nombre, x.cat, gen_random_uuid() as nuevo
    from jsonb_to_recordset(p_datos -> 'activos') as x(i int, alm uuid, sap text, cons int, clave text, nombre text, cat text)
  ), m as materialized (
    select a.*,
      coalesce(
        (select e.id_equipo from public.equipos e where a.sap is not null and e.sap_id = a.sap and e.tipo_pilar = p_pilar),
        (select e.id_equipo from public.equipos e where a.clave is not null and e.clave_id = a.clave and e.tipo_pilar = p_pilar),
        (select e.id_equipo from public.equipos e
          where e.tipo_pilar = p_pilar and e.id_almacen = a.alm and lower(e.nombre_equipo) = lower(a.nombre) limit 1)
      ) as existente,
      (a.sap is not null and exists (select 1 from public.equipos e where e.sap_id = a.sap and e.tipo_pilar <> p_pilar)) as sap_ajeno
    from a
  ), ins as (
    insert into public.equipos (id_equipo, id_almacen, sap_id, clave_id, nombre_equipo, tipo_pilar, categoria)
    select m.nuevo, m.alm, case when m.sap_ajeno then null else m.sap end, m.clave, m.nombre, p_pilar, m.cat
    from m where m.existente is null
    returning 1
  ), upd as (
    update public.equipos e
    set nombre_equipo = m.nombre, categoria = m.cat, id_almacen = m.alm, clave_id = coalesce(m.clave, e.clave_id)
    from m where e.id_equipo = m.existente
    returning 1
  )
  select jsonb_object_agg(m.i::text, coalesce(m.existente, m.nuevo)), (select count(*) from ins), (select count(*) from upd),
         count(*) filter (where m.sap_ajeno)
  into v_ids, v_ins, v_upd, v_ajeno
  from m;

  with p as (
    select distinct on (lower(trim(x.n))) trim(x.n) as nombre, x.d as cada, nullif(trim(x.t), '') as tareas
    from jsonb_to_recordset(coalesce(p_datos -> 'planes', '[]'::jsonb)) as x(n text, d int, t text)
    where length(trim(x.n)) between 2 and 80 and x.d between 1 and 3650
  ), ins as (
    insert into public.planes_mantenimiento (pilar, nombre, tipo, cada_dias, tareas)
    select p_pilar, p.nombre, 'preventivo', p.cada, p.tareas from p
    on conflict (tenant_id, pilar, (lower(trim(both from nombre)))) do nothing
    returning 1
  )
  select count(*) into v_planes from ins;

  with x as (
    select (v_ids ->> r.i::text)::uuid as id_equipo, lower(trim(r.n)) as plan, r.f as desde
    from jsonb_to_recordset(coalesce(p_datos -> 'asignaciones', '[]'::jsonb)) as r(i int, n text, f date)
  ), ins as (
    insert into public.plan_equipos (id_plan, id_equipo, fecha_asignacion)
    select pm.id_plan, x.id_equipo, coalesce(x.desde, (now() at time zone 'America/Mexico_City')::date)
    from x join public.planes_mantenimiento pm on pm.pilar = p_pilar and lower(trim(pm.nombre)) = x.plan
    where x.id_equipo is not null
    on conflict (id_plan, id_equipo) do nothing
    returning 1
  )
  select count(*) into v_asig from ins;

  with r as (
    select distinct (v_ids ->> x.i::text)::uuid as id_equipo, lower(trim(x.n)) as plan, x.f
    from jsonb_to_recordset(coalesce(p_datos -> 'programa', '[]'::jsonb)) as x(i int, n text, f date)
    where x.f between date '2000-01-01' and date '2100-12-31'
  ), ins as (
    insert into public.programa_mantenimiento (pilar, id_plan, id_equipo, fecha_programada, origen)
    select p_pilar, pe.id_plan, pe.id_equipo, r.f, 'programa-anual'
    from r
    join public.planes_mantenimiento pm on pm.pilar = p_pilar and lower(trim(pm.nombre)) = r.plan
    join public.plan_equipos pe on pe.id_plan = pm.id_plan and pe.id_equipo = r.id_equipo
    where not exists (
      select 1 from public.programa_mantenimiento g
      where g.tenant_id = pe.tenant_id and g.id_plan = pe.id_plan and g.id_equipo = pe.id_equipo and g.fecha_original = r.f)
    on conflict (tenant_id, id_plan, id_equipo, fecha_programada) do nothing
    returning 1
  )
  select count(*) into v_prog from ins;

  with f as (
    select x.alm, x.ficha from jsonb_to_recordset(coalesce(p_datos -> 'fichas', '[]'::jsonb)) as x(alm uuid, ficha jsonb)
  ), upd as (
    update public.almacenes a set ficha = coalesce(a.ficha, '{}'::jsonb) || f.ficha
    from f where a.id_almacen = f.alm
    returning 1
  )
  select count(*) into v_fichas from upd;

  v_resumen := jsonb_build_object(
    'archivo', p_datos ->> 'archivo', 'equipos_nuevos', v_ins, 'equipos_actualizados', v_upd, 'sap_en_otro_pilar', v_ajeno,
    'planes_nuevos', v_planes, 'asignaciones_nuevas', v_asig, 'programadas_nuevas', v_prog, 'fichas', v_fichas);
  perform private.bitacora_carga(p_pilar, v_resumen);
  return v_resumen;
end;
$function$;

-- Simulación: igual que en 20261029000002, más cómo queda el programa del pilar después de la carga
-- (programa: total, primera y última fecha, fechas por mes). programadas_nuevas viene de la carga.
create or replace function public.simular_programa_anual(p_pilar pilar, p_datos jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_antes jsonb; v_existentes int;
  v_res jsonb; v_total int; v_cambios jsonb; v_agenda jsonb; v_por jsonb; v_programa jsonb;
begin
  if not (select private.tiene_rol('{admin}')) then
    raise exception 'Solo el administrador puede cargar el programa anual' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(e.id_equipo::text, jsonb_build_object('n', e.nombre_equipo, 'c', e.categoria, 'a', e.id_almacen)), '{}'::jsonb), count(*)
  into v_antes, v_existentes
  from public.equipos e where e.tipo_pilar = p_pilar;

  begin
    v_res := public.cargar_programa_anual(p_pilar, p_datos);

    with c as (
      select e.sap_id as sap, e.clave_id as clave, b.value ->> 'n' as nombre_antes, e.nombre_equipo as nombre,
             b.value ->> 'c' as cat_antes, e.categoria as cat, aa.nombre_almacen as alm_antes, an.nombre_almacen as alm
      from jsonb_each(v_antes) b
      join public.equipos e on e.id_equipo = (b.key)::uuid
      left join public.almacenes aa on aa.id_almacen = (b.value ->> 'a')::uuid
      left join public.almacenes an on an.id_almacen = e.id_almacen
      where e.nombre_equipo is distinct from b.value ->> 'n' or e.categoria is distinct from b.value ->> 'c'
         or e.id_almacen::text is distinct from b.value ->> 'a'
    )
    select (select count(*) from c),
           coalesce((select jsonb_agg(to_jsonb(x)) from (select * from c order by c.alm_antes, c.nombre_antes limit 300) x), '[]'::jsonb),
           (select jsonb_build_object('nombre', count(*) filter (where c.nombre is distinct from c.nombre_antes),
                                      'categoria', count(*) filter (where c.cat is distinct from c.cat_antes),
                                      'almacen', count(*) filter (where c.alm is distinct from c.alm_antes)) from c)
    into v_total, v_cambios, v_por;

    select jsonb_build_object(
      'vencidos', count(*) filter (where v.dias_restantes < 0),
      'proximos_30', count(*) filter (where v.dias_restantes between 0 and 30),
      'despues', count(*) filter (where v.dias_restantes > 30))
    into v_agenda
    from public.v_plan_equipos v where v.pilar = p_pilar and v.cada_dias is not null;

    select jsonb_build_object(
      'total', coalesce(sum(k.n), 0), 'desde', min(k.desde), 'hasta', max(k.hasta),
      'por_mes', coalesce(jsonb_object_agg(k.mes, k.n order by k.mes) filter (where k.mes is not null), '{}'::jsonb))
    into v_programa
    from (
      select to_char(g.fecha_programada, 'YYYY-MM') as mes, count(*) as n, min(g.fecha_programada) as desde, max(g.fecha_programada) as hasta
      from public.programa_mantenimiento g where g.pilar = p_pilar group by 1
    ) k;

    raise exception using errcode = 'FA001', message = 'simulacion';
  exception when sqlstate 'FA001' then
    null; -- todo lo de arriba se deshace; las variables conservan lo medido
  end;

  return v_res || jsonb_build_object('existentes_antes', v_existentes, 'cambios_total', v_total, 'cambios_por', v_por,
                                     'cambios', v_cambios, 'agenda', v_agenda, 'programa', v_programa);
end;
$function$;

revoke all on function public.simular_programa_anual(public.pilar, jsonb) from public;
grant execute on function public.simular_programa_anual(public.pilar, jsonb) to authenticated;
