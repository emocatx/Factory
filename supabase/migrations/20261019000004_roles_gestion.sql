-- =====================================================================
-- Ajuste de roles:
--   · Gerente ve TODOS los pilares (solo consulta: no registra, no opera, no administra).
--   · Almacenes, líneas, equipos, componentes y causas: solo el administrador.
-- =====================================================================

create or replace function private.pilares_actuales() returns public.pilar[]
language sql stable security definer set search_path = '' as $$
  select case when p.rol in ('admin', 'gerente') then '{moviles,dorsales,criticos,infraestructura}'::public.pilar[] else p.pilares end
  from public.usuarios_perfiles p where p.id = (select auth.uid()) and p.activo
$$;

do $$
declare t text;
begin
  foreach t in array array['almacenes', 'lineas_dorsales', 'equipos', 'origenes_falla', 'modos_falla'] loop
    execute format($f$
      alter policy %1$s_insert on public.%1$I
        with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
      alter policy %1$s_update on public.%1$I
        using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')))
        with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
    $f$, t);
  end loop;
end $$;
