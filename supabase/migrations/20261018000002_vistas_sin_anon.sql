-- Las vistas ya respetan RLS (security_invoker), pero tampoco deben estar expuestas al rol anónimo.
revoke all on public.v_disponibilidad_almacen from anon;
revoke all on public.v_salud_lineas from anon;
