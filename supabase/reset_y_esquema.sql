-- =====================================================================
-- Factory · Limpieza del esquema de prueba + esquema final
-- Pegar completo en Supabase → SQL Editor → Run.
-- Solo borra objetos de Factory creados el 17-oct-2026 (tablas vacías).
-- =====================================================================
drop trigger if exists al_crear_usuario_auth on auth.users;
drop trigger if exists factory_nuevo_usuario on auth.users;
drop view if exists public.v_ordenes_detalle, public.v_disponibilidad_almacen, public.v_resumen_ordenes, public.v_salud_lineas;
drop table if exists public.bitacora, public.ordenes_mantenimiento, public.equipos, public.origenes_falla,
  public.lineas_dorsales, public.almacenes, public.usuarios_perfiles, public.tenants cascade;
drop function if exists public.crear_organizacion(text, text), public.concluir_orden(uuid, text, timestamptz),
  public.folio_disponible(text), public.tendencia_ordenes(text, integer);
drop schema if exists private cascade;
drop type if exists public.pilar, public.rol_usuario, public.estatus_equipo, public.estatus_orden, public.origen_falla, public.prioridad cascade;
-- =====================================================================

-- =====================================================================
-- Factory · Esquema completo (GMAO multitenant)
-- Anacronyc y JRia · Supabase / PostgreSQL 15+
--
-- Flujo: Operaciones (o Mantenimiento) levanta una solicitud →
--        Pendiente → Asignada → En proceso → Cerrada | Cancelada
-- Mientras una orden con equipo no esté cerrada/cancelada, el equipo está En paro.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.pilar          as enum ('moviles', 'dorsales', 'criticos', 'infraestructura');
create type public.rol_usuario    as enum ('admin', 'supervisor', 'tecnico', 'operaciones', 'lector');
create type public.estatus_equipo as enum ('activo', 'en_paro', 'baja');
create type public.estatus_orden  as enum ('pendiente', 'asignada', 'en_proceso', 'cerrada', 'cancelada');
create type public.prioridad      as enum ('baja', 'media', 'alta');

-- ---------------------------------------------------------------------
-- Tenants y perfiles
-- ---------------------------------------------------------------------
create table public.tenants (
  id                      uuid primary key default gen_random_uuid(),
  nombre_empresa          text not null check (length(trim(nombre_empresa)) > 0),
  zona_horaria            text not null default 'America/Mexico_City',
  pilares_activos         public.pilar[] not null default '{moviles,dorsales,criticos,infraestructura}',
  meta_mttr_horas         numeric(10, 2) not null default 2,
  meta_mtbf_horas         numeric(10, 2),
  meta_disponibilidad_pct numeric(5, 2)  not null default 90,
  fecha_creacion          timestamptz not null default now()
);

create table public.usuarios_perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  nombre          text not null,
  correo          text not null,
  rol             public.rol_usuario not null default 'tecnico',
  pilares         public.pilar[] not null default '{moviles,dorsales,criticos,infraestructura}',
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, id)
);
create index usuarios_perfiles_tenant_idx on public.usuarios_perfiles (tenant_id);

-- ---------------------------------------------------------------------
-- Helpers de seguridad (schema private: no expuesto por la API)
-- ---------------------------------------------------------------------
create or replace function private.tenant_actual() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.tenant_id from public.usuarios_perfiles p where p.id = (select auth.uid()) and p.activo
$$;

create or replace function private.rol_actual() returns public.rol_usuario
language sql stable security definer set search_path = '' as $$
  select p.rol from public.usuarios_perfiles p where p.id = (select auth.uid()) and p.activo
$$;

create or replace function private.tiene_rol(roles public.rol_usuario[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.rol_actual()) = any (roles), false)
$$;

-- Pilares que el usuario puede ver (admin: todos)
create or replace function private.pilares_actuales() returns public.pilar[]
language sql stable security definer set search_path = '' as $$
  select case when p.rol = 'admin' then '{moviles,dorsales,criticos,infraestructura}'::public.pilar[] else p.pilares end
  from public.usuarios_perfiles p where p.id = (select auth.uid()) and p.activo
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
create table public.almacenes (
  id_almacen      uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  nombre_almacen  text not null check (length(trim(nombre_almacen)) > 0),
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, nombre_almacen),
  unique (tenant_id, id_almacen)
);

create table public.lineas_dorsales (
  id_linea        uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  nombre_linea    text not null check (length(trim(nombre_linea)) > 0),
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, nombre_linea),
  unique (tenant_id, id_linea)
);

create table public.equipos (
  id_equipo       uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  id_almacen      uuid not null,
  id_linea        uuid,
  sap_id          text,
  clave_id        text,
  nombre_equipo   text not null check (length(trim(nombre_equipo)) > 0),
  tipo_pilar      public.pilar not null,
  estatus         public.estatus_equipo not null default 'activo',
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, id_equipo),
  foreign key (tenant_id, id_almacen) references public.almacenes (tenant_id, id_almacen) on delete restrict,
  foreign key (tenant_id, id_linea) references public.lineas_dorsales (tenant_id, id_linea) on delete restrict
);
create unique index equipos_sap_unq   on public.equipos (tenant_id, sap_id)   where sap_id is not null;
create unique index equipos_clave_unq on public.equipos (tenant_id, clave_id) where clave_id is not null;
create index equipos_tenant_pilar_idx   on public.equipos (tenant_id, tipo_pilar, estatus);
create index equipos_tenant_almacen_idx on public.equipos (tenant_id, id_almacen);
create index equipos_linea_idx          on public.equipos (tenant_id, id_linea) where id_linea is not null;

-- Orígenes de falla editables por empresa (pilares null = aplica a todos)
create table public.origenes_falla (
  id_origen       uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  pilares         public.pilar[],
  orden           integer not null default 100,
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, nombre),
  unique (tenant_id, id_origen)
);
create index origenes_tenant_idx on public.origenes_falla (tenant_id, activo, orden);

-- ---------------------------------------------------------------------
-- Órdenes / solicitudes
-- ---------------------------------------------------------------------
create table public.ordenes_mantenimiento (
  id_orden            uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  pilar               public.pilar not null,
  folio_ticket        text not null,
  id_equipo           uuid,
  id_linea            uuid,
  id_almacen          uuid,                     -- del equipo, o el que define Mantenimiento al cierre (Dorsales)
  id_origen           uuid,
  prioridad           public.prioridad not null default 'media',
  solicitante_id      uuid references auth.users (id) on delete set null,
  solicitante_nombre  text not null,
  solicitante_correo  text,
  recibe_nombre       text,
  asignado_a          uuid,
  descripcion_falla   text not null check (length(trim(descripcion_falla)) > 0),
  estatus_orden       public.estatus_orden not null default 'pendiente',
  fecha_ingreso       timestamptz not null default now(),
  fecha_asignacion    timestamptz,
  fecha_inicio        timestamptz,
  fecha_cierre        timestamptz,
  tiempo_paro_horas   numeric(10, 2) generated always as (
                        round((extract(epoch from (fecha_cierre - fecha_ingreso)) / 3600.0)::numeric, 2)
                      ) stored,
  tiempo_respuesta_horas numeric(10, 2) generated always as (
                        round((extract(epoch from (fecha_inicio - fecha_ingreso)) / 3600.0)::numeric, 2)
                      ) stored,
  notas_cierre        text,
  motivo_cancelacion  text,
  creado_por          uuid default auth.uid() references auth.users (id) on delete set null,
  cerrado_por         uuid references auth.users (id) on delete set null,
  fecha_creacion      timestamptz not null default now(),

  unique (tenant_id, folio_ticket),
  foreign key (tenant_id, id_equipo)  references public.equipos (tenant_id, id_equipo) on delete restrict,
  foreign key (tenant_id, id_linea)   references public.lineas_dorsales (tenant_id, id_linea) on delete restrict,
  foreign key (tenant_id, id_almacen) references public.almacenes (tenant_id, id_almacen) on delete restrict,
  foreign key (tenant_id, id_origen)  references public.origenes_falla (tenant_id, id_origen) on delete restrict,
  foreign key (tenant_id, asignado_a) references public.usuarios_perfiles (tenant_id, id) on delete set null (asignado_a),

  -- Dorsales trabajan por línea; los demás pilares por equipo
  constraint orden_destino_valido check (
    (pilar = 'dorsales' and id_linea is not null) or (pilar <> 'dorsales' and id_equipo is not null)
  ),
  -- Al cerrar: origen obligatorio; en Dorsales también almacén
  constraint orden_cierre_completo check (
    estatus_orden <> 'cerrada'
    or (fecha_cierre is not null and id_origen is not null and (pilar <> 'dorsales' or id_almacen is not null))
  ),
  constraint orden_asignacion_coherente check (estatus_orden not in ('asignada', 'en_proceso') or asignado_a is not null),
  constraint orden_fechas_validas check (
    (fecha_cierre is null or fecha_cierre >= fecha_ingreso)
    and (fecha_inicio is null or fecha_inicio >= fecha_ingreso)
  )
);
create index ordenes_tenant_estatus_idx on public.ordenes_mantenimiento (tenant_id, pilar, estatus_orden);
create index ordenes_tenant_ingreso_idx on public.ordenes_mantenimiento (tenant_id, pilar, fecha_ingreso desc);
create index ordenes_tenant_cierre_idx  on public.ordenes_mantenimiento (tenant_id, fecha_cierre desc) where fecha_cierre is not null;
create index ordenes_equipo_idx         on public.ordenes_mantenimiento (tenant_id, id_equipo)  where id_equipo is not null;
create index ordenes_linea_idx          on public.ordenes_mantenimiento (tenant_id, id_linea)   where id_linea is not null;
create index ordenes_origen_idx         on public.ordenes_mantenimiento (tenant_id, id_origen)  where id_origen is not null;
create index ordenes_almacen_idx        on public.ordenes_mantenimiento (tenant_id, id_almacen) where id_almacen is not null;
create index ordenes_asignado_idx       on public.ordenes_mantenimiento (tenant_id, asignado_a) where asignado_a is not null;
create index ordenes_solicitante_idx    on public.ordenes_mantenimiento (solicitante_id);
create index ordenes_creado_por_idx     on public.ordenes_mantenimiento (creado_por);
create index ordenes_cerrado_por_idx    on public.ordenes_mantenimiento (cerrado_por);

-- ---------------------------------------------------------------------
-- Folios autogenerados (consecutivo por tenant y pilar)
-- ---------------------------------------------------------------------
create table private.folio_secuencias (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pilar     public.pilar not null,
  ultimo    integer not null default 0,
  primary key (tenant_id, pilar)
);

create or replace function private.siguiente_folio(p_tenant uuid, p_pilar public.pilar) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
  v_prefijo text := case p_pilar when 'moviles' then 'MOV' when 'dorsales' then 'DOR' when 'criticos' then 'CRI' else 'INF' end;
begin
  insert into private.folio_secuencias (tenant_id, pilar, ultimo) values (p_tenant, p_pilar, 1)
  on conflict (tenant_id, pilar) do update set ultimo = private.folio_secuencias.ultimo + 1
  returning ultimo into v_n;
  return v_prefijo || '-' || lpad(v_n::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers de órdenes
-- ---------------------------------------------------------------------
create or replace function private.ordenes_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_linea uuid;
  v_almacen uuid;
  v_pilar public.pilar;
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.folio_ticket := nullif(upper(trim(coalesce(new.folio_ticket, ''))), '');
    if new.folio_ticket is null then
      new.folio_ticket := private.siguiente_folio(new.tenant_id, new.pilar);
    end if;
    new.creado_por := coalesce(v_uid, new.creado_por);
    new.solicitante_id := coalesce(new.solicitante_id, v_uid);
    new.cerrado_por := null;
    new.fecha_cierre := null;
    -- Operaciones solo crea solicitudes pendientes
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
    if old.estatus_orden in ('cerrada', 'cancelada') and new.estatus_orden = old.estatus_orden
       and not (select private.tiene_rol('{admin,supervisor}')) then
      raise exception 'La orden ya está %; solo un supervisor puede modificarla', old.estatus_orden using errcode = '42501';
    end if;
  end if;

  -- Equipo: completa línea (Dorsales) y almacén, y valida coherencia
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

  -- Sellos de tiempo por transición
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

create trigger ordenes_antes
before insert or update on public.ordenes_mantenimiento
for each row execute function private.ordenes_antes();

-- Estatus del equipo derivado de sus órdenes vivas
create or replace function private.recalcular_estatus_equipo(p_tenant uuid, p_equipo uuid) returns void
language sql security definer set search_path = '' as $$
  update public.equipos e
  set estatus = case when exists (
      select 1 from public.ordenes_mantenimiento o
      where o.tenant_id = p_tenant and o.id_equipo = p_equipo and o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    ) then 'en_paro'::public.estatus_equipo else 'activo'::public.estatus_equipo end
  where e.tenant_id = p_tenant and e.id_equipo = p_equipo and e.estatus <> 'baja'
    and e.estatus is distinct from (case when exists (
      select 1 from public.ordenes_mantenimiento o
      where o.tenant_id = p_tenant and o.id_equipo = p_equipo and o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    ) then 'en_paro'::public.estatus_equipo else 'activo'::public.estatus_equipo end);
$$;

create or replace function private.ordenes_despues() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.id_equipo is not null then
    perform private.recalcular_estatus_equipo(new.tenant_id, new.id_equipo);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.id_equipo is not null
     and (tg_op = 'DELETE' or old.id_equipo is distinct from new.id_equipo) then
    perform private.recalcular_estatus_equipo(old.tenant_id, old.id_equipo);
  end if;
  return null;
end;
$$;

create trigger ordenes_despues
after insert or update or delete on public.ordenes_mantenimiento
for each row execute function private.ordenes_despues();

-- tenant_id inmutable en catálogos y perfiles
create or replace function private.tenant_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.tenant_id := old.tenant_id;
  return new;
end;
$$;

create trigger almacenes_tenant_inmutable before update on public.almacenes        for each row execute function private.tenant_inmutable();
create trigger lineas_tenant_inmutable    before update on public.lineas_dorsales  for each row execute function private.tenant_inmutable();
create trigger equipos_tenant_inmutable   before update on public.equipos          for each row execute function private.tenant_inmutable();
create trigger origenes_tenant_inmutable  before update on public.origenes_falla   for each row execute function private.tenant_inmutable();
create trigger perfiles_tenant_inmutable  before update on public.usuarios_perfiles for each row execute function private.tenant_inmutable();

-- ---------------------------------------------------------------------
-- Bitácora de auditoría (Historial)
-- ---------------------------------------------------------------------
create table public.bitacora (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  pilar         public.pilar,
  tabla         text not null,
  registro_id   uuid not null,
  accion        text not null,
  datos_antes   jsonb,
  datos_despues jsonb,
  usuario_id    uuid,
  fecha         timestamptz not null default now()
);
create index bitacora_tenant_fecha_idx on public.bitacora (tenant_id, fecha desc);
create index bitacora_registro_idx     on public.bitacora (tenant_id, registro_id);

create or replace function private.registrar_bitacora() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fila    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_antes   jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_campo   text  := case tg_table_name when 'ordenes_mantenimiento' then 'estatus_orden' else 'estatus' end;
  v_accion  text;
begin
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

create trigger ordenes_bitacora after insert or update or delete on public.ordenes_mantenimiento
  for each row execute function private.registrar_bitacora();
create trigger equipos_bitacora after insert or update or delete on public.equipos
  for each row execute function private.registrar_bitacora();

-- ---------------------------------------------------------------------
-- Alta de organizaciones y usuarios
-- ---------------------------------------------------------------------
create or replace function private.sembrar_origenes(p_tenant uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.origenes_falla (tenant_id, nombre, pilares, orden) values
    (p_tenant, 'Desgaste natural',  null, 10),
    (p_tenant, 'Mala operación',    null, 20),
    (p_tenant, 'Desgaste forzado',  null, 30),
    (p_tenant, 'Diseño',            null, 40),
    (p_tenant, 'Error humano',      null, 50),
    (p_tenant, 'Desgaste en rueda', '{moviles}', 60)
  on conflict do nothing;
$$;

create or replace function private.tenant_nuevo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.sembrar_origenes(new.id);
  return null;
end;
$$;

create trigger al_crear_tenant after insert on public.tenants
  for each row execute function private.tenant_nuevo();

-- Invitados: app_metadata (solo editable con service role) trae tenant_id, rol y pilares
create or replace function private.nuevo_usuario_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := nullif(new.raw_app_meta_data ->> 'tenant_id', '')::uuid;
begin
  if v_tenant is not null then
    insert into public.usuarios_perfiles (id, tenant_id, nombre, correo, rol, pilares)
    values (
      new.id, v_tenant,
      coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1)),
      new.email,
      coalesce(nullif(new.raw_app_meta_data ->> 'rol', ''), 'tecnico')::public.rol_usuario,
      coalesce((select array_agg(x::public.pilar) from jsonb_array_elements_text(new.raw_app_meta_data -> 'pilares') x),
               '{moviles,dorsales,criticos,infraestructura}')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger factory_nuevo_usuario after insert on auth.users
  for each row execute function private.nuevo_usuario_auth();

create or replace function public.crear_organizacion(p_nombre_empresa text, p_nombre_usuario text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_correo text;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.usuarios_perfiles where id = v_uid) then
    raise exception 'El usuario ya pertenece a una organización';
  end if;
  select email into v_correo from auth.users where id = v_uid;
  insert into public.tenants (nombre_empresa) values (trim(p_nombre_empresa)) returning id into v_tenant;
  insert into public.usuarios_perfiles (id, tenant_id, nombre, correo, rol)
  values (v_uid, v_tenant, coalesce(nullif(trim(p_nombre_usuario), ''), split_part(v_correo, '@', 1)), v_correo, 'admin');
  return v_tenant;
end;
$$;

-- ---------------------------------------------------------------------
-- Acciones sobre órdenes (security invoker: RLS aplica)
-- ---------------------------------------------------------------------
create or replace function public.asignar_orden(p_id_orden uuid, p_tecnico uuid, p_prioridad public.prioridad default null)
returns public.ordenes_mantenimiento
language plpgsql security invoker set search_path = '' as $$
declare v public.ordenes_mantenimiento;
begin
  update public.ordenes_mantenimiento
  set asignado_a = p_tecnico,
      prioridad = coalesce(p_prioridad, prioridad),
      estatus_orden = case when estatus_orden = 'pendiente' then 'asignada' else estatus_orden end
  where id_orden = p_id_orden and estatus_orden in ('pendiente', 'asignada', 'en_proceso')
  returning * into v;
  if v.id_orden is null then raise exception 'La orden no existe, ya está cerrada o no tienes permiso'; end if;
  return v;
end;
$$;

create or replace function public.iniciar_orden(p_id_orden uuid) returns public.ordenes_mantenimiento
language plpgsql security invoker set search_path = '' as $$
declare v public.ordenes_mantenimiento;
begin
  update public.ordenes_mantenimiento
  set estatus_orden = 'en_proceso', asignado_a = coalesce(asignado_a, (select auth.uid()))
  where id_orden = p_id_orden and estatus_orden in ('pendiente', 'asignada')
  returning * into v;
  if v.id_orden is null then raise exception 'La orden no existe, ya está en proceso/cerrada o no tienes permiso'; end if;
  return v;
end;
$$;

create or replace function public.concluir_orden(
  p_id_orden uuid,
  p_id_origen uuid,
  p_id_almacen uuid default null,
  p_id_equipo uuid default null,
  p_notas text default null,
  p_fecha_cierre timestamptz default null
) returns public.ordenes_mantenimiento
language plpgsql security invoker set search_path = '' as $$
declare v public.ordenes_mantenimiento;
begin
  update public.ordenes_mantenimiento
  set estatus_orden = 'cerrada',
      id_origen = p_id_origen,
      id_almacen = coalesce(p_id_almacen, id_almacen),
      id_equipo = coalesce(p_id_equipo, id_equipo),
      notas_cierre = p_notas,
      fecha_cierre = coalesce(p_fecha_cierre, now())
  where id_orden = p_id_orden and estatus_orden in ('pendiente', 'asignada', 'en_proceso')
  returning * into v;
  if v.id_orden is null then raise exception 'La orden no existe, ya está cerrada o no tienes permiso'; end if;
  return v;
end;
$$;

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
    and (v_rol in ('admin', 'supervisor') or (o.solicitante_id = v_uid and o.estatus_orden = 'pendiente'))
  returning * into v;
  if v.id_orden is null then raise exception 'No puedes cancelar esta orden'; end if;
  return v;
end;
$$;

create or replace function public.folio_disponible(p_folio text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.ordenes_mantenimiento
    where tenant_id = (select private.tenant_actual()) and folio_ticket = upper(trim(p_folio))
  )
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tenants               enable row level security;
alter table public.usuarios_perfiles     enable row level security;
alter table public.almacenes             enable row level security;
alter table public.lineas_dorsales       enable row level security;
alter table public.equipos               enable row level security;
alter table public.origenes_falla        enable row level security;
alter table public.ordenes_mantenimiento enable row level security;
alter table public.bitacora              enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (id = (select private.tenant_actual()));
create policy tenants_update on public.tenants for update to authenticated
  using (id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')))
  with check (id = (select private.tenant_actual()));

create policy perfiles_select on public.usuarios_perfiles for select to authenticated
  using (tenant_id = (select private.tenant_actual()));
create policy perfiles_update on public.usuarios_perfiles for update to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')))
  with check (tenant_id = (select private.tenant_actual()));
create policy perfiles_delete on public.usuarios_perfiles for delete to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')) and id <> (select auth.uid()));

-- Catálogos: lectura para todo el tenant; escritura admin/supervisor; borrado admin
do $$
declare t text;
begin
  foreach t in array array['almacenes', 'lineas_dorsales', 'equipos', 'origenes_falla'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (tenant_id = (select private.tenant_actual()));
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')))
        with check (tenant_id = (select private.tenant_actual()));
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
    $f$, t);
  end loop;
end $$;

-- Órdenes: se ven las de los pilares permitidos.
--   alta: todos menos lector (Operaciones queda forzada a 'pendiente' por trigger)
--   edición (asignar, iniciar, cerrar): admin, supervisor, técnico
create policy ordenes_select on public.ordenes_mantenimiento for select to authenticated
  using (tenant_id = (select private.tenant_actual()) and pilar = any ((select private.pilares_actuales())::public.pilar[]));
create policy ordenes_insert on public.ordenes_mantenimiento for insert to authenticated
  with check (tenant_id = (select private.tenant_actual())
              and pilar = any ((select private.pilares_actuales())::public.pilar[])
              and (select private.tiene_rol('{admin,supervisor,tecnico,operaciones}')));
create policy ordenes_update on public.ordenes_mantenimiento for update to authenticated
  using (tenant_id = (select private.tenant_actual())
         and pilar = any ((select private.pilares_actuales())::public.pilar[])
         and (select private.tiene_rol('{admin,supervisor,tecnico}')))
  with check (tenant_id = (select private.tenant_actual()));
create policy ordenes_delete on public.ordenes_mantenimiento for delete to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));

create policy bitacora_select on public.bitacora for select to authenticated
  using (tenant_id = (select private.tenant_actual())
         and (pilar is null or pilar = any ((select private.pilares_actuales())::public.pilar[])));

revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------
-- Vistas (security_invoker → respetan RLS)
-- ---------------------------------------------------------------------
create view public.v_ordenes_detalle with (security_invoker = true) as
select
  o.*,
  f.nombre  as nombre_origen,
  e.nombre_equipo, e.sap_id, e.clave_id, e.estatus as estatus_equipo,
  a.nombre_almacen,
  l.nombre_linea,
  u.nombre  as nombre_asignado,
  t.zona_horaria,
  (o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as abierta,
  case when o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    then round((extract(epoch from (now() - o.fecha_ingreso)) / 3600.0)::numeric, 2)
    else o.tiempo_paro_horas end as horas_transcurridas
from public.ordenes_mantenimiento o
join public.tenants t on t.id = o.tenant_id
left join public.origenes_falla f on f.id_origen = o.id_origen
left join public.equipos e on e.id_equipo = o.id_equipo
left join public.almacenes a on a.id_almacen = o.id_almacen
left join public.lineas_dorsales l on l.id_linea = o.id_linea
left join public.usuarios_perfiles u on u.id = o.asignado_a;

create view public.v_disponibilidad_almacen with (security_invoker = true) as
select
  a.tenant_id, a.id_almacen, a.nombre_almacen, e.tipo_pilar,
  count(e.id_equipo) filter (where e.estatus <> 'baja')   as total_equipos,
  count(e.id_equipo) filter (where e.estatus = 'en_paro') as equipos_parados,
  count(e.id_equipo) filter (where e.estatus = 'activo')  as equipos_disponibles,
  case when count(e.id_equipo) filter (where e.estatus <> 'baja') = 0 then null
       else round(100.0 * count(e.id_equipo) filter (where e.estatus = 'activo')
                  / count(e.id_equipo) filter (where e.estatus <> 'baja'), 1) end as pct_disponibilidad
from public.almacenes a
join public.equipos e on e.id_almacen = a.id_almacen
where a.activo
group by a.tenant_id, a.id_almacen, a.nombre_almacen, e.tipo_pilar;

create view public.v_salud_lineas with (security_invoker = true) as
select
  l.tenant_id, l.id_linea, l.nombre_linea,
  count(o.id_orden) filter (where o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as carga_abierta,
  count(o.id_orden) filter (where o.estatus_orden = 'cerrada') as cierres_historicos,
  count(o.id_orden) filter (where o.estatus_orden <> 'cancelada') as total_ordenes,
  case when count(o.id_orden) filter (where o.estatus_orden <> 'cancelada') = 0 then 100.0
       else round(100.0 * count(o.id_orden) filter (where o.estatus_orden = 'cerrada')
                  / count(o.id_orden) filter (where o.estatus_orden <> 'cancelada'), 1) end as pct_salud,
  round(avg(o.tiempo_paro_horas) filter (where o.estatus_orden = 'cerrada'), 2) as mttr_horas,
  min(o.fecha_ingreso) filter (where o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as abierta_mas_antigua
from public.lineas_dorsales l
left join public.ordenes_mantenimiento o on o.id_linea = l.id_linea
where l.activo
group by l.tenant_id, l.id_linea, l.nombre_linea;

-- ---------------------------------------------------------------------
-- Analítica (security invoker)
--   base       = activos en alcance × horas del periodo
--   paro real  = traslape de cada orden [ingreso, cierre|ahora] con el periodo
--   MTTR       = paro de órdenes cerradas ÷ órdenes cerradas
--   MTBF       = (base − paro real) ÷ ingresos
--   Disp.      = (base − paro real) ÷ base
-- ---------------------------------------------------------------------
create or replace function public.indicadores(
  p_pilar public.pilar, p_id_linea uuid default null, p_id_equipo uuid default null,
  p_desde timestamptz default null, p_hasta timestamptz default null
)
returns table (
  activos_evaluados integer, ingresos bigint, cerradas bigint, en_paro bigint,
  horas_periodo numeric, horas_base numeric, horas_paro numeric, horas_paro_cerradas numeric, horas_operativas numeric,
  mttr_horas numeric, mtbf_horas numeric, disponibilidad_pct numeric,
  meta_mttr_horas numeric, meta_mtbf_horas numeric, meta_disponibilidad_pct numeric
)
language sql stable security invoker set search_path = '' as $$
  with ord as (
    select o.* from public.ordenes_mantenimiento o
    where o.pilar = p_pilar and o.estatus_orden <> 'cancelada'
      and (p_id_linea is null or o.id_linea = p_id_linea)
      and (p_id_equipo is null or o.id_equipo = p_id_equipo)
  ),
  ventana as (
    select coalesce(p_desde, (select min(fecha_ingreso) from ord), now()) as desde,
           least(coalesce(p_hasta, now()), now()) as hasta
  ),
  activos as (
    select case when p_id_equipo is not null then 1 else greatest(
      (select count(*) from public.equipos e
        where e.tipo_pilar = p_pilar and e.estatus <> 'baja' and (p_id_linea is null or e.id_linea = p_id_linea))::integer,
      case when p_pilar = 'dorsales' then
        (select count(*) from public.lineas_dorsales l where l.activo and (p_id_linea is null or l.id_linea = p_id_linea))::integer
      else 0 end) end as n
  ),
  en_ventana as (
    select o.*, greatest(0, extract(epoch from (
      least(coalesce(o.fecha_cierre, now()), v.hasta) - greatest(o.fecha_ingreso, v.desde))) / 3600.0) as paro_h
    from ord o, ventana v
    where o.fecha_ingreso < v.hasta and coalesce(o.fecha_cierre, now()) > v.desde
  ),
  calc as (
    select (select n from activos) as n,
      greatest(extract(epoch from (v.hasta - v.desde)) / 3600.0, 0) as h_periodo,
      (select count(*) from en_ventana where fecha_ingreso >= v.desde) as ingresos,
      (select count(*) from en_ventana where estatus_orden = 'cerrada' and fecha_cierre <= v.hasta) as cerradas,
      (select count(*) from ord where estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as en_paro,
      coalesce((select sum(paro_h) from en_ventana), 0) as paro,
      coalesce((select sum(tiempo_paro_horas) from en_ventana where estatus_orden = 'cerrada' and fecha_cierre <= v.hasta), 0) as paro_cerr
    from ventana v
  )
  select c.n, c.ingresos, c.cerradas, c.en_paro,
    round(c.h_periodo::numeric, 1), round((c.n * c.h_periodo)::numeric, 1),
    round(c.paro::numeric, 1), round(c.paro_cerr::numeric, 1),
    round(greatest(c.n * c.h_periodo - c.paro, 0)::numeric, 1),
    case when c.cerradas > 0 then round((c.paro_cerr / c.cerradas)::numeric, 2) end,
    case when c.ingresos > 0 then round((greatest(c.n * c.h_periodo - c.paro, 0) / c.ingresos)::numeric, 2) end,
    case when c.n * c.h_periodo > 0 then round((100.0 * greatest(c.n * c.h_periodo - c.paro, 0) / (c.n * c.h_periodo))::numeric, 1) end,
    t.meta_mttr_horas, t.meta_mtbf_horas, t.meta_disponibilidad_pct
  from calc c cross join lateral (select * from public.tenants limit 1) t
$$;

create or replace function public.top_fallas(
  p_pilar public.pilar, p_id_linea uuid default null,
  p_desde timestamptz default null, p_hasta timestamptz default null, p_limite integer default 5
)
returns table (id_equipo uuid, id_linea uuid, nombre text, sap_id text, nombre_linea text, fallas bigint, pct numeric, horas_paro numeric)
language sql stable security invoker set search_path = '' as $$
  with ord as (
    select o.* from public.ordenes_mantenimiento o
    where o.pilar = p_pilar and o.estatus_orden <> 'cancelada'
      and (p_id_linea is null or o.id_linea = p_id_linea)
      and (p_desde is null or o.fecha_ingreso >= p_desde)
      and (p_hasta is null or o.fecha_ingreso < p_hasta)
  ),
  total as (select count(*)::numeric as n from ord)
  select o.id_equipo,
    case when o.id_equipo is null then o.id_linea end,
    coalesce(e.nombre_equipo, l.nombre_linea, 'Sin activo'),
    e.sap_id,
    coalesce(le.nombre_linea, l.nombre_linea),
    count(*),
    round(100.0 * count(*) / nullif((select n from total), 0), 1),
    round(coalesce(sum(o.tiempo_paro_horas), 0)::numeric, 1)
  from ord o
  left join public.equipos e on e.id_equipo = o.id_equipo
  left join public.lineas_dorsales le on le.id_linea = e.id_linea
  left join public.lineas_dorsales l on l.id_linea = o.id_linea
  group by o.id_equipo, case when o.id_equipo is null then o.id_linea end, e.nombre_equipo, l.nombre_linea, e.sap_id, le.nombre_linea
  order by count(*) desc, 8 desc
  limit greatest(p_limite, 1)
$$;

create or replace function public.distribucion_origen(
  p_pilar public.pilar, p_id_linea uuid default null, p_desde timestamptz default null, p_hasta timestamptz default null
)
returns table (id_origen uuid, nombre text, fallas bigint, pct numeric, horas_paro numeric)
language sql stable security invoker set search_path = '' as $$
  with ord as (
    select o.* from public.ordenes_mantenimiento o
    where o.pilar = p_pilar and o.estatus_orden <> 'cancelada'
      and (p_id_linea is null or o.id_linea = p_id_linea)
      and (p_desde is null or o.fecha_ingreso >= p_desde)
      and (p_hasta is null or o.fecha_ingreso < p_hasta)
  ),
  total as (select count(*)::numeric as n from ord)
  select o.id_origen, coalesce(f.nombre, 'Sin clasificar'), count(*),
    round(100.0 * count(*) / nullif((select n from total), 0), 1),
    round(coalesce(sum(o.tiempo_paro_horas), 0)::numeric, 1)
  from ord o left join public.origenes_falla f on f.id_origen = o.id_origen
  group by o.id_origen, f.nombre
  order by count(*) desc
$$;

create or replace function public.resumen_ordenes(p_pilar public.pilar default null)
returns table (abiertas bigint, pendientes bigint, en_proceso bigint, cerradas bigint, ingresos_hoy bigint, cierres_hoy bigint,
               mttr_horas numeric, abierta_mas_antigua timestamptz)
language sql stable security invoker set search_path = '' as $$
  select
    count(*) filter (where o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')),
    count(*) filter (where o.estatus_orden = 'pendiente'),
    count(*) filter (where o.estatus_orden = 'en_proceso'),
    count(*) filter (where o.estatus_orden = 'cerrada'),
    count(*) filter (where (o.fecha_ingreso at time zone t.zona_horaria)::date = (now() at time zone t.zona_horaria)::date),
    count(*) filter (where (o.fecha_cierre at time zone t.zona_horaria)::date = (now() at time zone t.zona_horaria)::date),
    round(avg(o.tiempo_paro_horas) filter (where o.estatus_orden = 'cerrada'), 2),
    min(o.fecha_ingreso) filter (where o.estatus_orden in ('pendiente', 'asignada', 'en_proceso'))
  from (select * from public.tenants limit 1) t
  left join public.ordenes_mantenimiento o on o.tenant_id = t.id and (p_pilar is null or o.pilar = p_pilar)
$$;

create or replace function public.tendencia_ordenes(p_grano text default 'semana', p_periodos integer default 12, p_pilar public.pilar default null)
returns table (periodo date, ingresadas bigint, cerradas bigint)
language sql stable security invoker set search_path = '' as $$
  with cfg as (
    select case p_grano when 'mes' then 'month' when 'anio' then 'year' else 'week' end as g,
           (select zona_horaria from public.tenants limit 1) as tz
  ),
  ord as (select * from public.ordenes_mantenimiento o where p_pilar is null or o.pilar = p_pilar),
  serie as (
    select generate_series(
      date_trunc((select g from cfg), (now() at time zone (select tz from cfg)))
        - ((greatest(p_periodos, 1) - 1) || ' ' || (select g from cfg))::interval,
      date_trunc((select g from cfg), (now() at time zone (select tz from cfg))),
      ('1 ' || (select g from cfg))::interval
    )::date as periodo
  ),
  ing as (select date_trunc((select g from cfg), o.fecha_ingreso at time zone (select tz from cfg))::date as periodo, count(*) n from ord o group by 1),
  cie as (select date_trunc((select g from cfg), o.fecha_cierre at time zone (select tz from cfg))::date as periodo, count(*) n
          from ord o where o.fecha_cierre is not null group by 1)
  select s.periodo, coalesce(i.n, 0), coalesce(c.n, 0)
  from serie s left join ing i on i.periodo = s.periodo left join cie c on c.periodo = s.periodo
  order by s.periodo
$$;

-- Permisos de ejecución: solo usuarios autenticados
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'crear_organizacion', 'asignar_orden', 'iniciar_orden', 'concluir_orden', 'cancelar_orden', 'folio_disponible',
      'indicadores', 'top_fallas', 'distribucion_origen', 'resumen_ordenes', 'tendencia_ordenes')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;

-- Helper de plataforma que algunos proyectos traen: no invocable vía API
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Realtime para tableros
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ordenes_mantenimiento, public.equipos;
  end if;
end $$;


-- ===== Migración 2026-10-18: componente/modo de falla =====
-- =====================================================================
-- Factory · Componente / modo de falla separado de la causa
--   origenes_falla  = CAUSA   (por qué falló: desgaste natural, mala operación…)
--   modos_falla     = COMPONENTE o MODO (qué falló: ruedas, hidráulico, banda…)
-- Ambos se piden al concluir la orden.
-- =====================================================================

create table public.modos_falla (
  id_modo         uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default private.tenant_actual() references public.tenants (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  pilares         public.pilar[],
  orden           integer not null default 100,
  activo          boolean not null default true,
  fecha_creacion  timestamptz not null default now(),
  unique (tenant_id, nombre),
  unique (tenant_id, id_modo)
);
create index modos_tenant_idx on public.modos_falla (tenant_id, activo, orden);
create trigger modos_tenant_inmutable before update on public.modos_falla for each row execute function private.tenant_inmutable();

alter table public.modos_falla enable row level security;
create policy modos_falla_select on public.modos_falla for select to authenticated
  using (tenant_id = (select private.tenant_actual()));
create policy modos_falla_insert on public.modos_falla for insert to authenticated
  with check (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')));
create policy modos_falla_update on public.modos_falla for update to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin,supervisor}')))
  with check (tenant_id = (select private.tenant_actual()));
create policy modos_falla_delete on public.modos_falla for delete to authenticated
  using (tenant_id = (select private.tenant_actual()) and (select private.tiene_rol('{admin}')));
revoke all on public.modos_falla from anon;

alter table public.ordenes_mantenimiento add column id_modo uuid;
alter table public.ordenes_mantenimiento
  add constraint ordenes_modo_fk foreign key (tenant_id, id_modo) references public.modos_falla (tenant_id, id_modo) on delete restrict;
create index ordenes_modo_idx on public.ordenes_mantenimiento (tenant_id, id_modo) where id_modo is not null;

-- Catálogos por defecto (se siembran al crear cada organización)
create or replace function private.sembrar_origenes(p_tenant uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.origenes_falla (tenant_id, nombre, pilares, orden) values
    (p_tenant, 'Desgaste natural',        null, 10),
    (p_tenant, 'Mala operación',          null, 20),
    (p_tenant, 'Desgaste forzado',        null, 30),
    (p_tenant, 'Falta de mantenimiento',  null, 40),
    (p_tenant, 'Diseño',                  null, 50),
    (p_tenant, 'Error humano',            null, 60),
    (p_tenant, 'Agente externo',          null, 70)
  on conflict do nothing;
  insert into public.modos_falla (tenant_id, nombre, pilares, orden) values
    (p_tenant, 'Ruedas / llantas',            '{moviles}', 10),
    (p_tenant, 'Sistema hidráulico',          '{moviles}', 20),
    (p_tenant, 'Batería / cargador',          '{moviles}', 30),
    (p_tenant, 'Frenos',                      '{moviles}', 40),
    (p_tenant, 'Tracción / transmisión',      '{moviles}', 50),
    (p_tenant, 'Mástil / horquillas',         '{moviles}', 60),
    (p_tenant, 'Banda / rodillos',            '{dorsales}', 10),
    (p_tenant, 'Motor / reductor',            '{dorsales,criticos}', 20),
    (p_tenant, 'Sensores / fotoceldas',       '{dorsales}', 30),
    (p_tenant, 'Control / PLC',               '{dorsales,criticos}', 40),
    (p_tenant, 'Estructura / guardas',        '{dorsales}', 50),
    (p_tenant, 'Respaldo de energía',         '{criticos}', 60),
    (p_tenant, 'Climatización',               '{criticos,infraestructura}', 70),
    (p_tenant, 'Hidráulico / sanitario',      '{infraestructura}', 10),
    (p_tenant, 'Obra civil / estructura',     '{infraestructura}', 20),
    (p_tenant, 'Puertas / andenes',           '{infraestructura}', 30),
    (p_tenant, 'Iluminación',                 '{infraestructura}', 40),
    (p_tenant, 'Sistema eléctrico',           null, 80),
    (p_tenant, 'Otro',                        null, 99)
  on conflict do nothing;
$$;

-- Cierre: ahora pide componente/modo además de causa
alter function public.concluir_orden(uuid, uuid, uuid, uuid, text, timestamptz) rename to zz_old2_concluir_orden;
revoke execute on function public.zz_old2_concluir_orden(uuid, uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
create function public.concluir_orden(
  p_id_orden uuid,
  p_id_origen uuid,
  p_id_modo uuid,
  p_id_almacen uuid default null,
  p_id_equipo uuid default null,
  p_notas text default null,
  p_fecha_cierre timestamptz default null
) returns public.ordenes_mantenimiento
language plpgsql security invoker set search_path = '' as $$
declare v public.ordenes_mantenimiento;
begin
  if p_id_modo is null then raise exception 'Indica el componente o modo de falla'; end if;
  update public.ordenes_mantenimiento
  set estatus_orden = 'cerrada',
      id_origen = p_id_origen,
      id_modo = p_id_modo,
      id_almacen = coalesce(p_id_almacen, id_almacen),
      id_equipo = coalesce(p_id_equipo, id_equipo),
      notas_cierre = p_notas,
      fecha_cierre = coalesce(p_fecha_cierre, now())
  where id_orden = p_id_orden and estatus_orden in ('pendiente', 'asignada', 'en_proceso')
  returning * into v;
  if v.id_orden is null then raise exception 'La orden no existe, ya está cerrada o no tienes permiso'; end if;
  return v;
end;
$$;
revoke execute on function public.concluir_orden(uuid, uuid, uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.concluir_orden(uuid, uuid, uuid, uuid, uuid, text, timestamptz) to authenticated;

-- La vista expone el nombre del componente/modo
alter view public.v_ordenes_detalle rename to zz_old2_v_ordenes_detalle;
revoke all on public.zz_old2_v_ordenes_detalle from anon, authenticated;
create view public.v_ordenes_detalle with (security_invoker = true) as
select
  o.*,
  f.nombre  as nombre_origen,
  m.nombre  as nombre_modo,
  e.nombre_equipo, e.sap_id, e.clave_id, e.estatus as estatus_equipo,
  a.nombre_almacen,
  l.nombre_linea,
  u.nombre  as nombre_asignado,
  t.zona_horaria,
  (o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')) as abierta,
  case when o.estatus_orden in ('pendiente', 'asignada', 'en_proceso')
    then round((extract(epoch from (now() - o.fecha_ingreso)) / 3600.0)::numeric, 2)
    else o.tiempo_paro_horas end as horas_transcurridas
from public.ordenes_mantenimiento o
join public.tenants t on t.id = o.tenant_id
left join public.origenes_falla f on f.id_origen = o.id_origen
left join public.modos_falla m on m.id_modo = o.id_modo
left join public.equipos e on e.id_equipo = o.id_equipo
left join public.almacenes a on a.id_almacen = o.id_almacen
left join public.lineas_dorsales l on l.id_linea = o.id_linea
left join public.usuarios_perfiles u on u.id = o.asignado_a;
grant select on public.v_ordenes_detalle to authenticated;
revoke all on public.v_ordenes_detalle from anon;
-- Las vistas ya respetan RLS (security_invoker), pero tampoco deben estar expuestas al rol anónimo.
revoke all on public.v_disponibilidad_almacen from anon;
revoke all on public.v_salud_lineas from anon;
