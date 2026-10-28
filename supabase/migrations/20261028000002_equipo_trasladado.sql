-- Equipos trasladados: la orden se queda en el almacén donde ocurrió, pero el equipo ahora está en otro.
-- Con el alcance por almacén, quien ve la orden podría no ver el equipo y su nombre saldría vacío.
-- La vista toma la ficha del equipo (nombre, SAP, serie…) con una función que solo la da para órdenes
-- que la persona ya puede ver; el equipo en sí sigue fuera de su catálogo, 3D y registro.

create or replace function private.ficha_equipo(p_id uuid)
returns public.equipos language sql stable security definer set search_path = '' as $$
  select e.* from public.equipos e where e.id_equipo = p_id and e.tenant_id = (select private.tenant_actual())
$$;
revoke all on function private.ficha_equipo(uuid) from public;
grant execute on function private.ficha_equipo(uuid) to authenticated;

create or replace view public.v_ordenes_detalle with (security_invoker = true) as
 SELECT o.id_orden, o.tenant_id, o.pilar, o.folio_ticket, o.id_equipo, o.id_linea, o.id_almacen, o.id_origen, o.prioridad,
    o.solicitante_id, o.solicitante_nombre, o.solicitante_correo, o.recibe_nombre, o.asignado_a, o.descripcion_falla,
    o.estatus_orden, o.fecha_ingreso, o.fecha_asignacion, o.fecha_inicio, o.fecha_cierre, o.tiempo_paro_horas,
    o.tiempo_respuesta_horas, o.notas_cierre, o.motivo_cancelacion, o.creado_por, o.cerrado_por, o.fecha_creacion, o.id_modo,
    f.nombre AS nombre_origen,
    m.nombre AS nombre_modo,
    coalesce(e.nombre_equipo, fe.nombre_equipo) AS nombre_equipo,
    coalesce(e.sap_id, fe.sap_id) AS sap_id,
    coalesce(e.clave_id, fe.clave_id) AS clave_id,
    coalesce(e.estatus, fe.estatus) AS estatus_equipo,
    a.nombre_almacen,
    l.nombre_linea,
    u.nombre AS nombre_asignado,
    t.zona_horaria,
    o.estatus_orden = ANY (ARRAY['pendiente'::estatus_orden, 'asignada'::estatus_orden, 'en_proceso'::estatus_orden]) AS abierta,
    CASE
      WHEN o.estatus_orden = ANY (ARRAY['pendiente'::estatus_orden, 'asignada'::estatus_orden, 'en_proceso'::estatus_orden])
        THEN round(EXTRACT(epoch FROM now() - o.fecha_ingreso) / 3600.0, 2)
      ELSE o.tiempo_paro_horas
    END AS horas_transcurridas,
    coalesce(e.serie, fe.serie) AS serie
   FROM ordenes_mantenimiento o
     JOIN tenants t ON t.id = o.tenant_id
     LEFT JOIN origenes_falla f ON f.id_origen = o.id_origen
     LEFT JOIN modos_falla m ON m.id_modo = o.id_modo
     LEFT JOIN equipos e ON e.id_equipo = o.id_equipo
     -- solo se consulta cuando el equipo no está en el alcance de quien mira (equipo trasladado)
     LEFT JOIN LATERAL (
       SELECT x.* FROM private.ficha_equipo(o.id_equipo) x WHERE e.id_equipo IS NULL AND o.id_equipo IS NOT NULL
     ) fe ON true
     LEFT JOIN almacenes a ON a.id_almacen = o.id_almacen
     LEFT JOIN lineas_dorsales l ON l.id_linea = o.id_linea
     LEFT JOIN usuarios_perfiles u ON u.id = o.asignado_a;
