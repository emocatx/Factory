-- Importación de historial de fallas (Excel / CSV) para alimentar indicadores.
-- Las órdenes importadas llegan cerradas con sus fechas reales (o abiertas si así se elige),
-- se marcan como importadas y se deduplican por una referencia externa.

alter table public.ordenes_mantenimiento
  add column if not exists importada boolean not null default false,
  add column if not exists ref_externa text;

create unique index if not exists ordenes_ref_externa_unq
  on public.ordenes_mantenimiento (tenant_id, ref_externa)
  where ref_externa is not null;

-- Disparador previo: durante una importación (bandera de transacción puesta por la función
-- importar_historial_fallas, solo para administradores) se respetan estatus y fechas recibidos.
create or replace function private.ordenes_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_linea uuid;
  v_almacen uuid;
  v_pilar public.pilar;
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' and coalesce(current_setting('factory.importando', true), '') = '1'
     and (select private.tiene_rol('{admin}')) then
    new.folio_ticket := coalesce(nullif(upper(trim(coalesce(new.folio_ticket, ''))), ''),
                                 private.siguiente_folio(new.tenant_id, new.pilar));
    new.creado_por := coalesce(v_uid, new.creado_por);
    new.importada := true;
    if new.estatus_orden not in ('cerrada') then
      new.estatus_orden := 'pendiente';
      new.fecha_cierre := null;
    end if;
    if new.id_equipo is not null and new.id_almacen is null then
      select e.id_almacen into new.id_almacen
      from public.equipos e where e.tenant_id = new.tenant_id and e.id_equipo = new.id_equipo;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.folio_ticket := nullif(upper(trim(coalesce(new.folio_ticket, ''))), '');
    if new.folio_ticket is null then
      new.folio_ticket := private.siguiente_folio(new.tenant_id, new.pilar);
    end if;
    new.creado_por := coalesce(v_uid, new.creado_por);
    new.solicitante_id := coalesce(new.solicitante_id, v_uid);
    new.cerrado_por := null;
    new.fecha_cierre := null;
    new.importada := false;
    if (select private.rol_actual()) = 'operaciones' then
      new.estatus_orden := 'pendiente';
      new.asignado_a := null;
      new.fecha_asignacion := null;
      new.fecha_inicio := null;
    elsif new.estatus_orden in ('cerrada', 'cancelada') then
      new.estatus_orden := 'pendiente';
    end if;
  else
    new.tenant_id      := old.tenant_id;
    new.id_orden       := old.id_orden;
    new.pilar          := old.pilar;
    new.folio_ticket   := old.folio_ticket;
    new.creado_por     := old.creado_por;
    new.solicitante_id := old.solicitante_id;
    new.fecha_creacion := old.fecha_creacion;
    new.importada      := old.importada;
    new.ref_externa    := old.ref_externa;
    if old.estatus_orden in ('cerrada', 'cancelada') and new.estatus_orden = old.estatus_orden
       and not (select private.tiene_rol('{admin,supervisor}')) then
      raise exception 'La orden ya está %; solo un supervisor puede modificarla', old.estatus_orden using errcode = '42501';
    end if;
  end if;

  if new.id_equipo is not null then
    select e.id_linea, e.id_almacen, e.tipo_pilar into v_linea, v_almacen, v_pilar
    from public.equipos e where e.tenant_id = new.tenant_id and e.id_equipo = new.id_equipo;
    if v_pilar is not null and v_pilar <> new.pilar then
      raise exception 'El equipo pertenece a otro pilar' using errcode = '23514';
    end if;
    if new.pilar = 'dorsales' then
      if new.id_linea is null then new.id_linea := v_linea;
      elsif v_linea is not null and v_linea <> new.id_linea then
        raise exception 'El equipo no pertenece a la línea seleccionada' using errcode = '23514';
      end if;
    end if;
    if new.id_almacen is null then new.id_almacen := v_almacen; end if;
  end if;

  if new.estatus_orden is distinct from (case when tg_op = 'UPDATE' then old.estatus_orden end) then
    case new.estatus_orden
      when 'asignada'   then new.fecha_asignacion := coalesce(new.fecha_asignacion, now());
      when 'en_proceso' then
        new.fecha_asignacion := coalesce(new.fecha_asignacion, now());
        new.fecha_inicio := coalesce(new.fecha_inicio, now());
      when 'cerrada' then
        new.fecha_cierre := coalesce(new.fecha_cierre, now());
        new.fecha_inicio := coalesce(new.fecha_inicio, new.fecha_asignacion, new.fecha_cierre);
        new.cerrado_por := v_uid;
      when 'pendiente' then
        new.fecha_cierre := null; new.cerrado_por := null;
      else null;
    end case;
  end if;
  if new.estatus_orden not in ('cerrada') then
    new.fecha_cierre := null;
  end if;
  return new;
end;
$$;

-- Inserta un bloque de fallas ya emparejadas (máximo 1000). Solo administradores.
-- Cada elemento: ref, id_equipo, id_almacen, id_origen, id_modo, descripcion, solicitante, recibe,
-- fecha_ingreso, fecha_cierre (null = sigue abierta).
create or replace function public.importar_historial_fallas(p_pilar public.pilar, p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (select private.tenant_actual());
  v_total int := coalesce(jsonb_array_length(p_filas), 0);
  v_ins int;
  v_sin_clasificar uuid;
begin
  if v_tenant is null or not (select private.tiene_rol('{admin}')) then
    raise exception 'Solo el administrador puede importar historial' using errcode = '42501';
  end if;
  if v_total > 1000 then
    raise exception 'Máximo 1000 filas por bloque' using errcode = '22023';
  end if;

  perform set_config('factory.importando', '1', true);

  -- Las fallas cerradas exigen causa: las que no traen una reconocible quedan en "Sin clasificar"
  -- (inactiva, para que no aparezca al cerrar órdenes nuevas, pero sí en el análisis).
  if exists (select 1 from jsonb_array_elements(p_filas) x
             where coalesce(x ->> 'id_origen', '') = '' and coalesce(x ->> 'fecha_cierre', '') <> '') then
    select id_origen into v_sin_clasificar from public.origenes_falla
    where tenant_id = v_tenant and nombre = 'Sin clasificar';
    if v_sin_clasificar is null then
      insert into public.origenes_falla (tenant_id, nombre, orden, activo)
      values (v_tenant, 'Sin clasificar', 999, false)
      returning id_origen into v_sin_clasificar;
    end if;
  end if;

  with f as (
    select * from jsonb_to_recordset(p_filas) as x(
      ref text, id_equipo uuid, id_almacen uuid, id_origen uuid, id_modo uuid,
      descripcion text, solicitante text, recibe text, fecha_ingreso timestamptz, fecha_cierre timestamptz)
  ), unicas as (
    -- una sola fila por referencia y sin las que ya se importaron (no se gastan folios en repetidas)
    select distinct on (coalesce(nullif(trim(f.ref), ''), gen_random_uuid()::text)) f.* from f
    where nullif(trim(f.ref), '') is null or not exists (
      select 1 from public.ordenes_mantenimiento o where o.tenant_id = v_tenant and o.ref_externa = trim(f.ref))
  ), validas as (
    select f.* from unicas f
    join public.equipos e on e.tenant_id = v_tenant and e.id_equipo = f.id_equipo and e.tipo_pilar = p_pilar
    where f.fecha_ingreso is not null
      and (f.fecha_cierre is null or f.fecha_cierre >= f.fecha_ingreso)
      and (f.id_almacen is null or exists (select 1 from public.almacenes a where a.tenant_id = v_tenant and a.id_almacen = f.id_almacen))
      and (f.id_origen is null or exists (select 1 from public.origenes_falla o where o.tenant_id = v_tenant and o.id_origen = f.id_origen))
      and (f.id_modo is null or exists (select 1 from public.modos_falla m where m.tenant_id = v_tenant and m.id_modo = f.id_modo))
      -- una falla abierta no entra si el equipo ya tiene otra orden abierta
      and (f.fecha_cierre is not null or not exists (
        select 1 from public.ordenes_mantenimiento o
        where o.tenant_id = v_tenant and o.id_equipo = f.id_equipo and o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')))
    order by f.fecha_ingreso
  ), ins as (
    insert into public.ordenes_mantenimiento (
      tenant_id, pilar, folio_ticket, id_equipo, id_almacen, id_origen, id_modo,
      solicitante_nombre, recibe_nombre, descripcion_falla, estatus_orden, fecha_ingreso, fecha_cierre,
      ref_externa, importada, notas_cierre)
    select v_tenant, p_pilar, '', v.id_equipo, v.id_almacen,
      case when v.fecha_cierre is null then v.id_origen else coalesce(v.id_origen, v_sin_clasificar) end, v.id_modo,
      coalesce(nullif(trim(v.solicitante), ''), 'Sin dato'), nullif(trim(v.recibe), ''),
      coalesce(nullif(trim(v.descripcion), ''), 'Sin descripción'),
      case when v.fecha_cierre is null then 'pendiente'::public.estatus_orden else 'cerrada'::public.estatus_orden end,
      v.fecha_ingreso, v.fecha_cierre, nullif(trim(v.ref), ''), true,
      case when v.fecha_cierre is not null then 'Importada del historial' end
    from validas v
    on conflict (tenant_id, ref_externa) where ref_externa is not null do nothing
    returning 1
  )
  select count(*) into v_ins from ins;

  perform set_config('factory.importando', '', true);
  return jsonb_build_object('insertadas', v_ins, 'omitidas', v_total - v_ins);
end;
$$;

revoke all on function public.importar_historial_fallas(public.pilar, jsonb) from public, anon;
grant execute on function public.importar_historial_fallas(public.pilar, jsonb) to authenticated;
