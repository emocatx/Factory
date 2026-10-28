-- Alcance por almacén: además del pilar, cada persona ve y opera solo en los almacenes que tiene asignados.
--
-- · Se activa por empresa (tenants.alcance_por_almacen). Apagado, todo sigue como antes: así una empresa
--   chica no necesita asignar almacenes y la migración no cambia nada hasta que se enciende.
-- · Admin y gerente ven todos los almacenes; cualquier otra persona puede tener "todos los almacenes"
--   (p. ej. planeación o un coordinador nacional) si un admin o gerente se lo da.
-- · La orden guarda el almacén donde ocurrió (el de su equipo al registrarla) y ese dato no cambia
--   aunque después el equipo se traslade: el historial se queda en su almacén.
-- · Las asignaciones las gestiona la propia empresa: nadie da más de lo que tiene (mismo criterio que roles y pilares).

-- 1. Interruptor por empresa y "todos los almacenes" por persona ─────────────────────────────────
alter table public.tenants add column if not exists alcance_por_almacen boolean not null default false;
alter table public.usuarios_perfiles add column if not exists todos_almacenes boolean not null default false;

-- 2. Asignaciones ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.usuarios_almacenes (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios_perfiles(id) on delete cascade,
  almacen_id     uuid not null references public.almacenes(id_almacen) on delete cascade,
  es_responsable boolean not null default false,  -- responsable del almacén (avisos y escalamiento)
  vigente_hasta  date,                            -- coberturas temporales (vacaciones, apoyo); null = sin fin
  asignado_por   uuid default auth.uid(),
  asignado_en    timestamptz not null default now(),
  primary key (usuario_id, almacen_id)
);
create index if not exists usuarios_almacenes_almacen on public.usuarios_almacenes (almacen_id);
create index if not exists usuarios_almacenes_tenant on public.usuarios_almacenes (tenant_id);
create index if not exists ordenes_mantenimiento_almacen on public.ordenes_mantenimiento (id_almacen);
alter table public.usuarios_almacenes enable row level security;

-- 3. Funciones de alcance ─────────────────────────────────────────────────────────────────────────
-- Almacenes que la persona puede gestionar (asignar a otros): null = todos.
create or replace function private.almacenes_propios()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when p.rol in ('admin', 'gerente') or p.todos_almacenes then null
    else coalesce(array(
      select ua.almacen_id from public.usuarios_almacenes ua
      where ua.usuario_id = p.id and (ua.vigente_hasta is null or ua.vigente_hasta >= current_date)
    ), '{}'::uuid[]) end
  from public.usuarios_perfiles p where p.id = (select auth.uid()) and p.activo
$$;

-- Almacenes cuyos datos ve la persona: null = todos (empresa sin alcance por almacén, o rol global).
create or replace function private.almacenes_actuales()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when not t.alcance_por_almacen then null else (select private.almacenes_propios()) end
  from public.usuarios_perfiles p join public.tenants t on t.id = p.tenant_id
  where p.id = (select auth.uid()) and p.activo
$$;

-- 4. Almacén de la orden: el del equipo al registrarla; después no cambia ────────────────────────
create or replace function private.ordenes_almacen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- importación de historial: se respeta el almacén del archivo
  if tg_op = 'INSERT' and coalesce(current_setting('factory.importando', true), '') = '1' and new.id_almacen is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.id_equipo is not distinct from old.id_equipo then
    new.id_almacen := old.id_almacen;
    return new;
  end if;
  if new.id_equipo is not null then
    select e.id_almacen into new.id_almacen
    from public.equipos e where e.tenant_id = new.tenant_id and e.id_equipo = new.id_equipo;
  end if;
  return new;
end;
$$;
-- "ordenes_almacen" corre antes que "ordenes_antes" (orden alfabético de los disparadores BEFORE).
drop trigger if exists ordenes_almacen on public.ordenes_mantenimiento;
create trigger ordenes_almacen before insert or update on public.ordenes_mantenimiento
  for each row execute function private.ordenes_almacen();

-- 5. "Todos los almacenes" solo lo otorgan admin y gerente ───────────────────────────────────────
create or replace function private.proteger_todos_almacenes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.todos_almacenes is distinct from (case when tg_op = 'UPDATE' then old.todos_almacenes else false end)
     and (select auth.uid()) is not null
     and not (select private.tiene_rol('{admin,gerente}')) then
    raise exception 'Solo un administrador o gerente puede dar acceso a todos los almacenes' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists proteger_todos_almacenes on public.usuarios_perfiles;
create trigger proteger_todos_almacenes before insert or update on public.usuarios_perfiles
  for each row execute function private.proteger_todos_almacenes();

-- 6. Reglas de acceso (RLS) ───────────────────────────────────────────────────────────────────────
-- Condición común: el almacén está en el alcance (o la fila no tiene almacén, como las líneas de Dorsales).

-- Órdenes
drop policy if exists ordenes_select on public.ordenes_mantenimiento;
create policy ordenes_select on public.ordenes_mantenimiento for select to authenticated using (
  tenant_id = (select private.tenant_actual())
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and (id_almacen is null or (select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
);
drop policy if exists ordenes_insert on public.ordenes_mantenimiento;
create policy ordenes_insert on public.ordenes_mantenimiento for insert to authenticated with check (
  tenant_id = (select private.tenant_actual())
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and (select private.tiene_rol('{admin,supervisor,coordinador,tecnico,operaciones}'))
  and (id_almacen is null or (select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
);
drop policy if exists ordenes_update on public.ordenes_mantenimiento;
create policy ordenes_update on public.ordenes_mantenimiento for update to authenticated using (
  tenant_id = (select private.tenant_actual())
  and pilar = any ((select private.pilares_actuales())::public.pilar[])
  and (select private.tiene_rol('{admin,supervisor,coordinador,tecnico}'))
  and (id_almacen is null or (select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
) with check (
  tenant_id = (select private.tenant_actual())
  and (id_almacen is null or (select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
);

-- Equipos y almacenes: solo los del alcance (catálogos, 3D, registro)
drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos for select to authenticated using (
  tenant_id = (select private.tenant_actual())
  and ((select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
);
drop policy if exists almacenes_select on public.almacenes;
create policy almacenes_select on public.almacenes for select to authenticated using (
  tenant_id = (select private.tenant_actual())
  and ((select private.almacenes_actuales()) is null or id_almacen = any ((select private.almacenes_actuales())::uuid[]))
);

-- Asignaciones: las ve toda la empresa; las cambia quien puede dar ese rol, dentro de sus almacenes
drop policy if exists usuarios_almacenes_select on public.usuarios_almacenes;
create policy usuarios_almacenes_select on public.usuarios_almacenes for select to authenticated using (
  tenant_id = (select private.tenant_actual())
);
drop policy if exists usuarios_almacenes_escribir on public.usuarios_almacenes;
create policy usuarios_almacenes_escribir on public.usuarios_almacenes for all to authenticated using (
  tenant_id = (select private.tenant_actual())
  and ((select private.almacenes_propios()) is null or almacen_id = any ((select private.almacenes_propios())::uuid[]))
  and exists (
    select 1 from public.usuarios_perfiles u
    where u.id = usuario_id and u.tenant_id = (select private.tenant_actual()) and u.id <> (select auth.uid())
      and u.rol = any ((select private.roles_que_otorgo())::public.rol_usuario[])
  )
) with check (
  tenant_id = (select private.tenant_actual())
  and ((select private.almacenes_propios()) is null or almacen_id = any ((select private.almacenes_propios())::uuid[]))
  and exists (select 1 from public.almacenes a where a.id_almacen = almacen_id and a.tenant_id = (select private.tenant_actual()))
  and exists (
    select 1 from public.usuarios_perfiles u
    where u.id = usuario_id and u.tenant_id = (select private.tenant_actual()) and u.id <> (select auth.uid())
      and u.rol = any ((select private.roles_que_otorgo())::public.rol_usuario[])
  )
);

-- 7. Cancelar (security definer: no pasa por RLS) respeta el alcance ─────────────────────────────
create or replace function public.cancelar_orden(p_id_orden uuid, p_motivo text)
returns public.ordenes_mantenimiento language plpgsql security definer set search_path = '' as $$
declare
  v public.ordenes_mantenimiento;
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := (select private.rol_actual());
  v_alm uuid[] := (select private.almacenes_actuales());
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de cancelación'; end if;
  update public.ordenes_mantenimiento o
  set estatus_orden = 'cancelada', motivo_cancelacion = trim(p_motivo)
  where o.id_orden = p_id_orden
    and o.tenant_id = (select private.tenant_actual())
    and o.pilar = any ((select private.pilares_actuales())::public.pilar[])
    and (o.id_almacen is null or v_alm is null or o.id_almacen = any (v_alm))
    and o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    and (v_rol in ('admin', 'supervisor', 'coordinador') or (o.solicitante_id = v_uid and o.estatus_orden = 'pendiente'))
  returning * into v;
  if v.id_orden is null then raise exception 'No puedes cancelar esta orden'; end if;
  return v;
end;
$$;

grant select, insert, update, delete on public.usuarios_almacenes to authenticated;
revoke all on function private.almacenes_propios() from public;
revoke all on function private.almacenes_actuales() from public;
grant execute on function private.almacenes_propios() to authenticated;
grant execute on function private.almacenes_actuales() to authenticated;
