-- Para dar de alta personas sin correo: busca una cuenta existente por correo.
-- Solo la usa el servidor con service role (nunca el navegador).
create or replace function public.buscar_usuario_auth(p_correo text)
returns table (id uuid, tenant_id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id, p.tenant_id
  from auth.users u left join public.usuarios_perfiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_correo))
  limit 1
$$;
revoke execute on function public.buscar_usuario_auth(text) from public, anon, authenticated;
grant execute on function public.buscar_usuario_auth(text) to service_role;
