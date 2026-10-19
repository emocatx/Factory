"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Quita la marca de "cambiar contraseña" después de que la persona definió la suya. */
export async function marcarContrasenaCambiada() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.app_metadata?.cambiar_contrasena) return;
  try {
    await createServiceClient().auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, cambiar_contrasena: false } });
  } catch {
    // sin service role no se puede limpiar; la persona volverá a ver la pantalla de contraseña
  }
}
