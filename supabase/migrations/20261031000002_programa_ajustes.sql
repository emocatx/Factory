-- Ajustes al programa de mantenimiento (20261031000001) tras las revisiones de seguridad y rendimiento.
--
-- · Rendimiento: resumen_programa lee la tabla filtrando por periodo (antes recorría toda la vista del pilar) y un
--   índice parcial para la fecha original. v_programa sin anio_iso / semana_iso (nadie los usa).
-- · Producto: "vencidos" cuenta todos los abiertos de semanas anteriores, de cualquier año (cuadra con la lista).
-- · Seguridad: límites de fecha al completar (7 días el técnico, 90 los editores) y al reprogramar (30 / 366);
--   sin update directo a la tabla (todo pasa por asignar_programa / cambiar_estatus_programa); insert y delete
--   directos solo del admin; bitácora de cada cambio; nada para anon; vigencia del almacén con la misma fecha que
--   private.almacenes_propios().

-- 1. Índice para medir por la fecha original (solo las filas reprogramadas) ─────────────────────────────────────
create index programa_original_idx on public.programa_mantenimiento (tenant_id, pilar, fecha_original)
  where fecha_original is not null;

-- 2. Permisos directos sobre la tabla ──────────────────────────────────────────────────────────────────────────
-- Lectura con RLS; insert y delete solo admin (la carga del programa anual y limpiezas); los cambios de estatus y
-- de responsable solo por las funciones (security definer, validan adentro).
drop policy programa_insert on public.programa_mantenimiento;
drop policy programa_update on public.programa_mantenimiento;
drop policy programa_delete on public.programa_mantenimiento;

revoke all on public.programa_mantenimiento from anon, authenticated;
grant select, insert, delete on public.programa_mantenimiento to authenticated;

-- Insert: solo admin, una fila nueva tal cual sale del programa (programado, sin responsable ni fechas de
-- realización o reprogramación), con plan del mismo pilar y equipo de ese pilar.
create policy programa_insert on public.programa_mantenimiento for insert to authenticated with check (
  tenant_id = (select private.tenant_actual())
  and (select private.tiene_rol('{admin}'))
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and estatus = 'programado'
  and id_responsable is null
  and fecha_realizada is null
  and fecha_original is null
  and exists (select 1 from public.planes_mantenimiento p
              where p.tenant_id = programa_mantenimiento.tenant_id and p.id_plan = programa_mantenimiento.id_plan
                and p.pilar = programa_mantenimiento.pilar)
  and exists (select 1 from public.equipos e
              where e.tenant_id = programa_mantenimiento.tenant_id and e.id_equipo = programa_mantenimiento.id_equipo
                and e.tipo_pilar = programa_mantenimiento.pilar
                and ((select private.almacenes_actuales()) is null or e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

create policy programa_delete on public.programa_mantenimiento for delete to authenticated using (
  tenant_id = (select private.tenant_actual())
  and (select private.tiene_rol('{admin}'))
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and ((select private.almacenes_actuales()) is null or exists (
    select 1 from public.equipos e
    where e.id_equipo = programa_mantenimiento.id_equipo and e.id_almacen = any ((select private.almacenes_actuales())::uuid[])))
);

-- 3. Bitácora de cambios ──────────────────────────────────────────────────────────────────────────────────────
-- Estatus, fechas, responsable y motivo antes y después, con quién lo hizo. Como registrar_bitacora: en una carga
-- masiva del admin no se escribe (la carga deja su propio registro). Un update que no cambia nada no se registra.
create or replace function private.bitacora_programa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fila   public.programa_mantenimiento := case when tg_op = 'DELETE' then old else new end;
  v_equipo text;
  v_accion text;
begin
  if coalesce(current_setting('factory.carga_masiva', true), '') = '1' and (select private.tiene_rol('{admin}')) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (new.estatus, new.fecha_programada, new.fecha_original, new.fecha_realizada, new.id_responsable, new.motivo)
       is not distinct from (old.estatus, old.fecha_programada, old.fecha_original, old.fecha_realizada, old.id_responsable, old.motivo) then
    return null;
  end if;

  select e.nombre_equipo into v_equipo from public.equipos e where e.tenant_id = v_fila.tenant_id and e.id_equipo = v_fila.id_equipo;
  if tg_op = 'DELETE' then v_accion := 'eliminacion';
  elsif new.estatus is distinct from old.estatus then
    v_accion := case new.estatus
      when 'asignado' then 'asignacion' when 'en_ejecucion' then 'inicio' when 'completado' then 'cierre'
      when 'reprogramado' then 'reprogramacion' when 'no_realizado' then 'no_realizado' when 'programado' then 'reapertura'
      else 'edicion' end;
  elsif new.id_responsable is distinct from old.id_responsable then v_accion := 'asignacion';
  else v_accion := 'edicion';
  end if;

  insert into public.bitacora (tenant_id, pilar, tabla, registro_id, accion, datos_antes, datos_despues, usuario_id)
  values (
    v_fila.tenant_id, v_fila.pilar, 'programa_mantenimiento', v_fila.id, v_accion,
    jsonb_build_object('nombre_equipo', v_equipo, 'id_plan', old.id_plan, 'estatus', old.estatus,
      'fecha_programada', old.fecha_programada, 'fecha_original', old.fecha_original, 'fecha_realizada', old.fecha_realizada,
      'id_responsable', old.id_responsable, 'motivo', old.motivo),
    case when tg_op = 'DELETE' then null else jsonb_build_object('nombre_equipo', v_equipo, 'id_plan', new.id_plan,
      'estatus', new.estatus, 'fecha_programada', new.fecha_programada, 'fecha_original', new.fecha_original,
      'fecha_realizada', new.fecha_realizada, 'id_responsable', new.id_responsable, 'motivo', new.motivo) end,
    (select auth.uid())
  );
  return null;
end;
$$;
revoke all on function private.bitacora_programa() from public, anon, authenticated;

create trigger programa_bitacora after update or delete on public.programa_mantenimiento
  for each row execute function private.bitacora_programa();

-- 4. Asignar: vigencia del almacén del responsable con current_date, igual que private.almacenes_propios() ────
create or replace function private.asignar_programa(p_ids uuid[], p_responsable uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_tenant  uuid := (select private.tenant_actual());
  v_pilares public.pilar[] := (select private.pilares_actuales());
  v_alm     uuid[] := (select private.almacenes_actuales());
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
      where ua.usuario_id = v_resp.id and ua.almacen_id = e.id_almacen and (ua.vigente_hasta is null or ua.vigente_hasta >= current_date)))
    and pm.estatus in ('programado', 'reprogramado', 'asignado');
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ninguno de esos servicios se puede asignar a esa persona' using errcode = 'FA002';
  end if;
  return v_n;
end;
$$;

-- 5. Cambiar estatus: límites de fecha ─────────────────────────────────────────────────────────────────────────
-- · completado: la fecha realizada no es futura ni más antigua que hoy − 7 días (técnico) u hoy − 90 (editores).
-- · reprogramado: la nueva fecha va de hoy a hoy + 30 (técnico) u hoy + 366 (editores).
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
  v_atras   integer;
  v_adelante integer;
  v_motivo  text := nullif(trim(p_motivo), '');
  v_fecha   date;
  v_n       integer;
begin
  if v_tenant is null or v_rol is null or v_rol not in ('admin', 'supervisor', 'coordinador', 'tecnico') then
    raise exception 'No tienes permiso para cambiar el programa' using errcode = '42501';
  end if;
  v_editor := v_rol in ('admin', 'supervisor', 'coordinador');
  v_atras := case when v_editor then 90 else 7 end;
  v_adelante := case when v_editor then 366 else 30 end;
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
    if v_fecha < v_hoy - v_atras then
      raise exception 'La fecha de realización no puede ser de hace más de % días', v_atras using errcode = '22023';
    end if;
  elsif p_estatus = 'reprogramado' then
    if p_fecha is null then raise exception 'Indica la nueva fecha' using errcode = '22023'; end if;
    if p_fecha < v_hoy then raise exception 'La nueva fecha no puede ser anterior a hoy' using errcode = '22023'; end if;
    if p_fecha > v_hoy + v_adelante then
      raise exception 'La nueva fecha no puede ser a más de % días', v_adelante using errcode = '22023';
    end if;
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
-- (create or replace conserva los permisos de 20261031000001: sin public ni anon, execute para authenticated)

-- 6. Métricas: leen la tabla por periodo ───────────────────────────────────────────────────────────────────────
-- Mismo jsonb que antes. Periodo por fecha_plan (la original si se reprogramó):
--   programados = con fecha_plan hasta hoy; completados, a_tiempo, reprogramados y no_realizados de esos;
--   total = todo el periodo (también lo que falta);
--   vencidos = abiertos con fecha programada de una semana anterior a la actual, de cualquier año.
-- semana y mes = la semana ISO y el mes actuales, por fecha_programada (sin importar el periodo).
-- Las fechas de hoy van escritas en el where (no desde un CTE) para que el planeador use los índices.
create or replace function public.resumen_programa(
  p_pilar public.pilar, p_desde date, p_hasta date, p_almacen uuid default null, p_responsable uuid default null)
returns jsonb language sql stable set search_path = '' as $$
  with hoy as (
    select (now() at time zone 'America/Mexico_City')::date as d,
           date_trunc('week', (now() at time zone 'America/Mexico_City'))::date as lunes,
           date_trunc('month', (now() at time zone 'America/Mexico_City'))::date as mes
  ), r as (
    select e.id_almacen, pm.id_responsable, pm.estatus, pm.fecha_original, pm.fecha_realizada, x.fecha_plan,
           x.fecha_plan between p_desde and p_hasta as en_periodo,
           (x.fecha_plan between p_desde and p_hasta and x.fecha_plan <= h.d) as a_la_fecha,
           (pm.estatus not in ('completado', 'no_realizado') and pm.fecha_programada < h.lunes) as vencido
    from public.programa_mantenimiento pm
    cross join lateral (select coalesce(pm.fecha_original, pm.fecha_programada) as fecha_plan) x
    join public.equipos e on e.tenant_id = pm.tenant_id and e.id_equipo = pm.id_equipo
    cross join hoy h
    where pm.tenant_id = (select private.tenant_actual())
      and pm.pilar = p_pilar
      and e.estatus <> 'baja'
      and (p_almacen is null or e.id_almacen = p_almacen)
      and (p_responsable is null or pm.id_responsable = p_responsable)
      and (   (pm.fecha_original is null and pm.fecha_programada between p_desde and p_hasta)
           or (pm.fecha_original between p_desde and p_hasta)
           or (pm.estatus not in ('completado', 'no_realizado')
               and pm.fecha_programada < date_trunc('week', (now() at time zone 'America/Mexico_City'))::date))
  ), m as (
    select r.id_almacen, r.id_responsable,
           grouping(r.id_almacen) as g_alm, grouping(r.id_responsable) as g_resp,
           count(*) filter (where r.a_la_fecha) as programados,
           count(*) filter (where r.a_la_fecha and r.estatus = 'completado') as completados,
           count(*) filter (where r.a_la_fecha and r.estatus = 'completado'
                              and r.fecha_realizada <= date_trunc('week', r.fecha_plan)::date + 6) as a_tiempo,
           count(*) filter (where r.vencido) as vencidos,
           count(*) filter (where r.a_la_fecha and r.fecha_original is not null) as reprogramados,
           count(*) filter (where r.a_la_fecha and r.estatus = 'no_realizado') as no_realizados,
           count(*) filter (where r.en_periodo) as total
    from r
    group by grouping sets ((), (r.id_almacen), (r.id_responsable))
  ), avance as (
    select count(*) filter (where pm.fecha_programada between h.lunes and h.lunes + 6) as semana_total,
           count(*) filter (where pm.fecha_programada between h.lunes and h.lunes + 6 and pm.estatus = 'completado') as semana_completados,
           count(*) filter (where pm.fecha_programada >= h.mes and pm.fecha_programada < (h.mes + interval '1 month')::date) as mes_total,
           count(*) filter (where pm.fecha_programada >= h.mes and pm.fecha_programada < (h.mes + interval '1 month')::date
                              and pm.estatus = 'completado') as mes_completados
    from public.programa_mantenimiento pm
    join public.equipos e on e.tenant_id = pm.tenant_id and e.id_equipo = pm.id_equipo
    cross join hoy h
    where pm.tenant_id = (select private.tenant_actual())
      and pm.pilar = p_pilar
      and e.estatus <> 'baja'
      and (p_almacen is null or e.id_almacen = p_almacen)
      and (p_responsable is null or pm.id_responsable = p_responsable)
      and pm.fecha_programada >= least(date_trunc('week', (now() at time zone 'America/Mexico_City'))::date,
                                       date_trunc('month', (now() at time zone 'America/Mexico_City'))::date)
      and pm.fecha_programada <= greatest(date_trunc('week', (now() at time zone 'America/Mexico_City'))::date + 6,
                                          (date_trunc('month', (now() at time zone 'America/Mexico_City')) + interval '1 month')::date)
  )
  select jsonb_build_object(
    'hoy', (select d from hoy),
    'totales', coalesce((select to_jsonb(x) - '{id_almacen,id_responsable,g_alm,g_resp}'::text[]
                         from m x where x.g_alm = 1 and x.g_resp = 1), '{}'::jsonb),
    'por_almacen', coalesce((select jsonb_agg((to_jsonb(x) - '{id_responsable,g_alm,g_resp}'::text[])
                                              || jsonb_build_object('nombre_almacen', a.nombre_almacen) order by a.nombre_almacen)
                             from m x left join public.almacenes a on a.id_almacen = x.id_almacen
                             where x.g_alm = 0), '[]'::jsonb),
    'por_responsable', coalesce((select jsonb_agg((to_jsonb(x) - '{id_almacen,g_alm,g_resp}'::text[])
                                                  || jsonb_build_object('responsable', u.nombre) order by u.nombre nulls first)
                                 from m x left join public.usuarios_perfiles u on u.id = x.id_responsable
                                 where x.g_resp = 0), '[]'::jsonb),
    'semana', (select jsonb_build_object('total', a.semana_total, 'completados', a.semana_completados) from avance a),
    'mes', (select jsonb_build_object('total', a.mes_total, 'completados', a.mes_completados) from avance a)
  )
$$;
-- (create or replace conserva los permisos: execute solo authenticated)

-- 7. Vista sin anio_iso / semana_iso ───────────────────────────────────────────────────────────────────────────
drop view public.v_programa;
create view public.v_programa with (security_invoker = true) as
select pm.id, pm.tenant_id, pm.pilar, pm.id_plan, pm.id_equipo,
       pm.fecha_programada, pm.fecha_original, coalesce(pm.fecha_original, pm.fecha_programada) as fecha_plan,
       pm.estatus, pm.id_responsable, u.nombre as responsable, pm.fecha_realizada, pm.motivo, pm.origen,
       pm.actualizado_por, pm.actualizado_en,
       e.nombre_equipo, e.sap_id, e.clave_id, e.categoria, e.id_almacen, a.nombre_almacen,
       p.nombre as plan, p.cada_dias,
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
revoke all on public.v_programa from anon, authenticated;
grant select on public.v_programa to authenticated;

-- 8. Nada para anon en la carga ni en la simulación ────────────────────────────────────────────────────────────
revoke execute on function public.cargar_programa_anual(public.pilar, jsonb) from public, anon;
revoke execute on function public.simular_programa_anual(public.pilar, jsonb) from public, anon;
grant execute on function public.cargar_programa_anual(public.pilar, jsonb) to authenticated;
grant execute on function public.simular_programa_anual(public.pilar, jsonb) to authenticated;
