-- Un equipo detenido (con orden abierta) no admite otra orden hasta que se libere la actual.
create unique index if not exists ordenes_equipo_abierta_unq
  on public.ordenes_mantenimiento (tenant_id, id_equipo)
  where id_equipo is not null and estatus_orden in ('pendiente', 'asignada', 'en_proceso');
