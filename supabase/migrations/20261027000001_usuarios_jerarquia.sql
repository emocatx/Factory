-- Altas y edición de usuarios en cascada: cada nivel administra a los niveles de abajo.
--   admin → todos · gerente → coordinador y abajo · coordinador → supervisor, técnico, operaciones, lector
--   supervisor → técnico, operaciones
-- Debe coincidir con rolesQueOtorga() en lib/catalogos.ts. Reemplaza perfiles_update_coordinador
-- (respaldada en private.respaldo_politicas_20261027). La política perfiles_update del admin no cambia.

create or replace function private.roles_que_otorgo()
returns public.rol_usuario[]
language sql
stable
security definer
set search_path = ''
as $$
  select case (select private.rol_actual())
    when 'admin' then '{admin,gerente,coordinador,supervisor,tecnico,operaciones,lector}'::public.rol_usuario[]
    when 'gerente' then '{coordinador,supervisor,tecnico,operaciones,lector}'::public.rol_usuario[]
    when 'coordinador' then '{supervisor,tecnico,operaciones,lector}'::public.rol_usuario[]
    when 'supervisor' then '{tecnico,operaciones}'::public.rol_usuario[]
    else '{}'::public.rol_usuario[]
  end
$$;
revoke all on function private.roles_que_otorgo() from public, anon;
grant execute on function private.roles_que_otorgo() to authenticated;

drop policy if exists perfiles_update_coordinador on public.usuarios_perfiles;
drop policy if exists perfiles_update_jerarquia on public.usuarios_perfiles;

-- USING: a quién puedo tocar (su rol actual está bajo el mío, comparte al menos un pilar conmigo, no soy yo).
-- WITH CHECK: qué le puedo dejar (un rol bajo el mío y, salvo admin/gerente, solo pilares míos).
create policy perfiles_update_jerarquia on public.usuarios_perfiles
  for update to authenticated
  using (
    tenant_id = (select private.tenant_actual())
    and id <> (select auth.uid())
    and rol = any ((select private.roles_que_otorgo())::public.rol_usuario[])
    and ((select private.tiene_rol('{admin,gerente}')) or pilares && (select private.pilares_actuales())::public.pilar[])
  )
  with check (
    tenant_id = (select private.tenant_actual())
    and rol = any ((select private.roles_que_otorgo())::public.rol_usuario[])
    and ((select private.tiene_rol('{admin,gerente}')) or pilares <@ (select private.pilares_actuales())::public.pilar[])
  );
