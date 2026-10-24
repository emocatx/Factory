-- Indicadores filtrables por almacén (reemplaza el filtro por equipo en la pantalla).
-- p_id_equipo se conserva para no romper llamadas existentes.
drop function if exists public.indicadores(public.pilar, uuid, uuid, timestamptz, timestamptz);

create or replace function public.indicadores(
  p_pilar public.pilar,
  p_id_linea uuid default null,
  p_id_equipo uuid default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_id_almacen uuid default null
)
returns table (
  activos_evaluados integer, ingresos bigint, cerradas bigint, en_paro bigint,
  horas_periodo numeric, horas_base numeric, horas_paro numeric, horas_paro_cerradas numeric,
  horas_operativas numeric, mttr_horas numeric, mtbf_horas numeric, disponibilidad_pct numeric,
  meta_mttr_horas numeric, meta_mtbf_horas numeric, meta_disponibilidad_pct numeric
)
language sql
stable
set search_path = ''
as $$
  with ord as (
    select o.* from public.ordenes_mantenimiento o
    where o.pilar = p_pilar and o.estatus_orden <> 'cancelada'
      and (p_id_linea is null or o.id_linea = p_id_linea)
      and (p_id_equipo is null or o.id_equipo = p_id_equipo)
      and (p_id_almacen is null or o.id_almacen = p_id_almacen)
  ),
  ventana as (
    select coalesce(p_desde, (select min(fecha_ingreso) from ord), now()) as desde,
           least(coalesce(p_hasta, now()), now()) as hasta
  ),
  activos as (
    select case when p_id_equipo is not null then 1 else greatest(
      (select count(*) from public.equipos e
        where e.tipo_pilar = p_pilar and e.estatus <> 'baja'
          and (p_id_linea is null or e.id_linea = p_id_linea)
          and (p_id_almacen is null or e.id_almacen = p_id_almacen))::integer,
      case when p_pilar = 'dorsales' and p_id_almacen is null then
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

revoke all on function public.indicadores(public.pilar, uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.indicadores(public.pilar, uuid, uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;
