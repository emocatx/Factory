-- "En vivo" por Broadcast en lugar de postgres_changes.
-- postgres_changes evalúa RLS una vez por cada suscriptor en cada cambio y sondea el WAL sin parar
-- (95% del tiempo de base con 4 conexiones). Aquí la base manda un solo aviso por sentencia y por
-- tenant a un canal privado "tenant:<id>"; cada navegador decide si recarga.

create or replace function private.avisar_cambio()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tenant uuid;
begin
  -- Por sentencia: una importación de 600 equipos genera un aviso, no 600.
  for v_tenant in select distinct f.tenant_id from filas f loop
    perform realtime.send(jsonb_build_object('tabla', tg_table_name), 'cambio', 'tenant:' || v_tenant, true);
  end loop;
  return null;
end;
$$;

-- Las tablas de transición solo se permiten con un evento por trigger: tres por tabla.
create trigger ordenes_aviso_ins after insert on public.ordenes_mantenimiento
  referencing new table as filas for each statement execute function private.avisar_cambio();
create trigger ordenes_aviso_upd after update on public.ordenes_mantenimiento
  referencing new table as filas for each statement execute function private.avisar_cambio();
create trigger ordenes_aviso_del after delete on public.ordenes_mantenimiento
  referencing old table as filas for each statement execute function private.avisar_cambio();

create trigger equipos_aviso_ins after insert on public.equipos
  referencing new table as filas for each statement execute function private.avisar_cambio();
create trigger equipos_aviso_upd after update on public.equipos
  referencing new table as filas for each statement execute function private.avisar_cambio();
create trigger equipos_aviso_del after delete on public.equipos
  referencing old table as filas for each statement execute function private.avisar_cambio();

-- Cada usuario solo puede escuchar el canal de su propio tenant.
create policy "en_vivo_tenant_recibe" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'tenant:' || (select private.tenant_actual())::text
  );

-- Las tablas viejas ya no necesitan replicarse.
alter publication supabase_realtime drop table public.zz_old_equipos, public.zz_old_ordenes_mantenimiento;
