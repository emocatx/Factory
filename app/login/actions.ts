"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoForm = { error?: string; ok?: string } | undefined;

export async function iniciarSesion(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim();
  const contrasena = String(form.get("contrasena") ?? "");
  const siguiente = String(form.get("next") ?? "/");
  if (!correo || !contrasena) return { error: "Captura correo y contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
  if (error) return { error: "Credenciales inválidas o cuenta sin confirmar." };

  redirect(siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/");
}

export async function registrarCuenta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim();
  const contrasena = String(form.get("contrasena") ?? "");
  if (contrasena.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmar?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/onboarding");
  return { ok: "Te enviamos un correo para confirmar tu cuenta." };
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
