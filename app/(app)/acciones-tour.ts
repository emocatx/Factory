"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Marca el recorrido de bienvenida como visto. Se guarda en user_metadata (cada usuario puede
 * editar el suyo con su propia sesión), así no hace falta tocar usuarios_perfiles ni su RLS.
 * Se refresca la sesión para que el JWT nuevo ya lo traiga en la siguiente página.
 */
export async function marcarTourVisto() {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { tour_visto: true } });
  if (!error) await supabase.auth.refreshSession();
}
