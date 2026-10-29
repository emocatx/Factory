-- Importador único: plantilla Factory + traductores. Dos cambios:
-- 1. Cada empresa guarda cómo se unen las columnas de su Excel a los campos de Factory
--    (firma de encabezados → campo → encabezado), para no repetirlo cada mes.
-- 2. cargar_programa_anual acepta la clave interna que trae la plantilla (p. ej. "MC-04"); si no viene,
--    el consecutivo sigue siendo la clave con el prefijo del pilar (INF-784).

alter table public.tenants
  add column if not exists mapeos_importacion jsonb not null default '{}'::jsonb;

alter table public.tenants drop constraint if exists tenants_mapeos_importacion_tam;
alter table public.tenants add constraint tenants_mapeos_importacion_tam
  check (jsonb_typeof(mapeos_importacion) = 'object' and pg_column_size(mapeos_importacion) < 65536);

create or replace function public.cargar_programa_anual(p_pilar pilar, p_datos jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_ids jsonb;
  v_ins int; v_upd int; v_ajeno int; v_planes int; v_asig int; v_fichas int;
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
    'planes_nuevos', v_planes, 'asignaciones_nuevas', v_asig, 'fichas', v_fichas);
  perform private.bitacora_carga(p_pilar, v_resumen);
  return v_resumen;
end;
$function$;
