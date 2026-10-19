-- Rol Gerente (consulta de gestión). Va solo porque un valor nuevo de enum no se puede usar en la misma transacción.
alter type public.rol_usuario add value if not exists 'gerente' after 'admin';
