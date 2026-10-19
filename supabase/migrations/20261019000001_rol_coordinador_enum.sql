-- Rol Coordinador (va en su propia migración: un valor nuevo de enum no puede usarse en la misma transacción)
alter type public.rol_usuario add value if not exists 'coordinador' after 'supervisor';
