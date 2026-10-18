"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function crearOrganizacion(form: FormData) {
  const empresa = String(form.get("empresa") ?? "").trim();
  const nombre = String(form.get("nombre") ?? "").trim();
  if (!empresa) redirect("/onboarding?error=" + encodeURIComponent("Captura el nombre de la empresa"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_organizacion", { p_nombre_empresa: empresa, p_nombre_usuario: nombre });
  if (error) redirect("/onboarding?error=" + encodeURIComponent(error.message));
  redirect("/configuracion?bienvenida=1");
}
