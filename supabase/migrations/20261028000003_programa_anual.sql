-- Programa anual de mantenimiento: categoría de equipo, ficha de almacén y carga en una sola transacción.
--
-- · equipos.categoria: andén, louver, extractor, racks… (la deduce el importador y se puede corregir).
-- · almacenes.ficha: andenes, pasillos, zonas y elementos de techo; con ella se arma la nave en 3D.
-- · cargar_programa_anual(): crea o actualiza equipos, crea los planes que falten y asigna cada activo a sus
--   planes desde la fecha del programa. Corre con los permisos de quien llama (solo admin) y es idempotente:
--   volver a cargar el mismo archivo no duplica nada.

alter table public.equipos add column if not exists categoria text;
create index if not exists equipos_categoria_idx on public.equipos (tenant_id, tipo_pilar, categoria) where categoria is not null;
alter table public.almacenes add column if not exists ficha jsonb;

-- Bitácora: en una carga masiva (marca factory.carga_masiva, solo admin) no se registra fila por fila;
-- la carga deja un solo registro con el resumen.
create or replace function private.registrar_bitacora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fila    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_antes   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_campo   text  := case tg_table_name when 'ordenes_mantenimiento' then 'estatus_orden' else 'estatus' end;
  v_accion  text;
begin
  if coalesce(current_setting('factory.carga_masiva', true), '') = '1' and (select private.tiene_rol('{admin}')) then
    return null;
  end if;
  if tg_op = 'INSERT' then v_accion := 'alta';
  elsif tg_op = 'DELETE' then v_accion := 'eliminacion';
  elsif (v_fila ->> v_campo) is distinct from (v_antes ->> v_campo) then
    v_accion := case v_fila ->> v_campo
      when 'asignada' then 'asignacion' when 'en_proceso' then 'inicio' when 'cerrada' then 'cierre'
      when 'cancelada' then 'cancelacion' when 'pendiente' then 'reapertura'
      when 'en_paro' then 'paro' when 'activo' then 'liberacion' when 'baja' then 'baja' else 'edicion' end;
  else v_accion := 'edicion';
  end if;

  insert into public.bitacora (tenant_id, pilar, tabla, registro_id, accion, datos_antes, datos_despues, usuario_id)
  values (
    (v_fila ->> 'tenant_id')::uuid,
    coalesce(v_fila ->> 'pilar', v_fila ->> 'tipo_pilar')::public.pilar,
    tg_table_name,
    coalesce(v_fila ->> 'id_orden', v_fila ->> 'id_equipo')::uuid,
    v_accion,
    v_antes,
    case when tg_op = 'DELETE' then null else v_fila end,
    (select auth.uid())
  );
  return null;
end;
$$;

-- Un registro de bitácora con el resumen de la carga (la bitácora no admite escritura directa).
create or replace function private.bitacora_carga(p_pilar public.pilar, p_resumen jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.bitacora (tenant_id, pilar, tabla, registro_id, accion, datos_despues, usuario_id)
  values ((select private.tenant_actual()), p_pilar, 'equipos', gen_random_uuid(), 'importacion', p_resumen, (select auth.uid()))
$$;
revoke all on function private.bitacora_carga(public.pilar, jsonb) from public;
grant execute on function private.bitacora_carga(public.pilar, jsonb) to authenticated;

-- p_datos = {
--   archivo, activos: [{ i, alm, sap, cons, nombre, cat }],
--   planes: [{ n, d, t }], asignaciones: [{ i, n, f }], fichas: [{ alm, ficha }]
-- }
-- Los equipos se reconocen por SAP, por su consecutivo interno (clave INF-123) o por nombre dentro del almacén.
create or replace function public.cargar_programa_anual(p_pilar public.pilar, p_datos jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
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

  -- 1. Equipos
  with a as materialized (
    select x.i, x.alm, nullif(trim(x.sap), '') as sap,
           case when x.cons is not null then upper(left(p_pilar::text, 3)) || '-' || x.cons end as clave,
           trim(x.nombre) as nombre, x.cat, gen_random_uuid() as nuevo
    from jsonb_to_recordset(p_datos -> 'activos') as x(i int, alm uuid, sap text, cons int, nombre text, cat text)
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

  -- 2. Planes: se crean los que falten (los existentes no se tocan)
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

  -- 3. Asignaciones: cada activo con sus planes; la fecha de asignación hace que el próximo servicio
  --    caiga en la fecha del programa. Las que ya existían conservan su avance.
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

  -- 4. Fichas de almacén (se mezclan con lo que ya tuvieran)
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
$$;
revoke all on function public.cargar_programa_anual(public.pilar, jsonb) from public;
grant execute on function public.cargar_programa_anual(public.pilar, jsonb) to authenticated;
