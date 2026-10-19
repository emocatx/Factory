-- =====================================================================
-- Coordinador: ve sus pilares, registra, asigna/reasigna y cancela.
-- No inicia ni cierra órdenes, no edita equipos ni catálogos.
-- =====================================================================

-- Puede dar de alta solicitudes y actualizar órdenes (la regla fina va en el trigger de abajo)
alter policy ordenes_insert on public.ordenes_mantenimiento
  with check (tenant_id = (select private.tenant_actual())
              and pilar = any ((select private.pilares_actuales())::public.pilar[])
              and (select private.tiene_rol('{admin,supervisor,coordinador,tecnico,operaciones}')));
alter policy ordenes_update on public.ordenes_mantenimiento
  using (tenant_id = (select private.tenant_actual())
         and pilar = any ((select private.pilares_actuales())::public.pilar[])
         and (select private.tiene_rol('{admin,supervisor,coordinador,tecnico}')))
  with check (tenant_id = (select private.tenant_actual()));

-- Límite del coordinador: no inicia, no cierra y no toca los datos de cierre
create or replace function private.limitar_coordinador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select private.rol_actual()) = 'coordinador' then
    if new.estatus_orden is distinct from old.estatus_orden and new.estatus_orden in ('en_proceso', 'cerrada') then
      raise exception 'El coordinador asigna y da seguimiento; iniciar o cerrar lo hace mantenimiento' using errcode = '42501';
    end if;
    if new.id_origen is distinct from old.id_origen or new.id_modo is distinct from old.id_modo
       or new.notas_cierre is distinct from old.notas_cierre or new.fecha_cierre is distinct from old.fecha_cierre then
      raise exception 'El coordinador no puede modificar los datos de cierre' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger ordenes_limitar_coordinador before update on public.ordenes_mantenimiento
  for each row execute function private.limitar_coordinador();

-- Cancelar: admin, supervisor y coordinador (o quien la levantó, mientras siga pendiente)
create or replace function public.cancelar_orden(p_id_orden uuid, p_motivo text) returns public.ordenes_mantenimiento
language plpgsql security definer set search_path = '' as $$
declare
  v public.ordenes_mantenimiento;
  v_uid uuid := (select auth.uid());
  v_rol public.rol_usuario := (select private.rol_actual());
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de cancelación'; end if;
  update public.ordenes_mantenimiento o
  set estatus_orden = 'cancelada', motivo_cancelacion = trim(p_motivo)
  where o.id_orden = p_id_orden
    and o.tenant_id = (select private.tenant_actual())
    and o.pilar = any ((select private.pilares_actuales())::public.pilar[])
    and o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    and (v_rol in ('admin', 'supervisor', 'coordinador') or (o.solicitante_id = v_uid and o.estatus_orden = 'pendiente'))
  returning * into v;
  if v.id_orden is null then raise exception 'No puedes cancelar esta orden'; end if;
  return v;
end;
$$;

-- El coordinador administra a su equipo: supervisores, técnicos, operaciones y lectores de SUS pilares.
-- No puede editar administradores ni coordinadores, ni dar pilares que él no tiene.
create policy perfiles_update_coordinador on public.usuarios_perfiles for update to authenticated
  using (tenant_id = (select private.tenant_actual())
         and (select private.tiene_rol('{coordinador}'))
         and id <> (select auth.uid())
         and rol in ('supervisor', 'tecnico', 'operaciones', 'lector'))
  with check (tenant_id = (select private.tenant_actual())
              and rol in ('supervisor', 'tecnico', 'operaciones', 'lector')
              and pilares <@ (select private.pilares_actuales()));

-- Postgres combina con OR los WITH CHECK de todas las políticas de UPDATE: la del admin debe exigir
-- también el rol admin, o un coordinador podría pasar su cambio por la validación del admin.
alter policy perfiles_update on public.usuarios_perfiles
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')))
  with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
