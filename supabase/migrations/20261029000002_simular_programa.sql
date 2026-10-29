-- Simulación de la carga del programa: corre cargar_programa_anual completo dentro de una subtransacción, mide lo
-- que cambió y la deshace. Así el paso Confirmar del importador dice exactamente qué va a pasar (equipos nuevos,
-- cuáles existentes cambian de nombre, categoría o almacén, y cómo queda la agenda) sin guardar nada.

create or replace function public.simular_programa_anual(p_pilar pilar, p_datos jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_antes jsonb; v_existentes int;
  v_res jsonb; v_total int; v_cambios jsonb; v_agenda jsonb; v_por jsonb;
begin
  if not (select private.tiene_rol('{admin}')) then
    raise exception 'Solo el administrador puede cargar el programa anual' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(e.id_equipo::text, jsonb_build_object('n', e.nombre_equipo, 'c', e.categoria, 'a', e.id_almacen)), '{}'::jsonb), count(*)
  into v_antes, v_existentes
  from public.equipos e where e.tipo_pilar = p_pilar;

  begin
    v_res := public.cargar_programa_anual(p_pilar, p_datos);

    with c as (
      select e.sap_id as sap, e.clave_id as clave, b.value ->> 'n' as nombre_antes, e.nombre_equipo as nombre,
             b.value ->> 'c' as cat_antes, e.categoria as cat, aa.nombre_almacen as alm_antes, an.nombre_almacen as alm
      from jsonb_each(v_antes) b
      join public.equipos e on e.id_equipo = (b.key)::uuid
      left join public.almacenes aa on aa.id_almacen = (b.value ->> 'a')::uuid
      left join public.almacenes an on an.id_almacen = e.id_almacen
      where e.nombre_equipo is distinct from b.value ->> 'n' or e.categoria is distinct from b.value ->> 'c'
         or e.id_almacen::text is distinct from b.value ->> 'a'
    )
    select (select count(*) from c),
           coalesce((select jsonb_agg(to_jsonb(x)) from (select * from c order by c.alm_antes, c.nombre_antes limit 300) x), '[]'::jsonb),
           (select jsonb_build_object('nombre', count(*) filter (where c.nombre is distinct from c.nombre_antes),
                                      'categoria', count(*) filter (where c.cat is distinct from c.cat_antes),
                                      'almacen', count(*) filter (where c.alm is distinct from c.alm_antes)) from c)
    into v_total, v_cambios, v_por;

    select jsonb_build_object(
      'vencidos', count(*) filter (where v.dias_restantes < 0),
      'proximos_30', count(*) filter (where v.dias_restantes between 0 and 30),
      'despues', count(*) filter (where v.dias_restantes > 30))
    into v_agenda
    from public.v_plan_equipos v where v.pilar = p_pilar and v.cada_dias is not null;

    raise exception using errcode = 'FA001', message = 'simulacion';
  exception when sqlstate 'FA001' then
    null; -- todo lo de arriba se deshace; las variables conservan lo medido
  end;

  return v_res || jsonb_build_object('existentes_antes', v_existentes, 'cambios_total', v_total, 'cambios_por', v_por, 'cambios', v_cambios, 'agenda', v_agenda);
end;
$function$;

revoke all on function public.simular_programa_anual(public.pilar, jsonb) from public;
grant execute on function public.simular_programa_anual(public.pilar, jsonb) to authenticated;
