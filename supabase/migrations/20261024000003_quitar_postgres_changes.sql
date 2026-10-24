-- El "En vivo" ya usa Broadcast (20261024000002): sin estas tablas en la publicación,
-- Realtime deja de sondear el WAL.
alter publication supabase_realtime drop table public.ordenes_mantenimiento, public.equipos;
