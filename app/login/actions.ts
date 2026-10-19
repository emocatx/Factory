"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** `reenviar` = mostrar el botón para volver a mandar la confirmación a `correo`. */
export type EstadoForm = { error?: string; ok?: string; reenviar?: boolean; correo?: string } | undefined;

const sitio = () => process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** Traduce los errores de correo de Supabase a algo accionable. */
function errorCorreo(m: string): string {
  const t = m.toLowerCase();
  if (t.includes("rate limit") || t.includes("only request this after") || t.includes("too many"))
    return "Se alcanzó el límite de correos por ahora. Espera unos minutos e inténtalo de nuevo.";
  if (t.includes("not authorized"))
    return "El servicio de correo de prueba de Supabase no puede enviar a este correo. El administrador debe configurar un SMTP propio.";
  if (t.includes("invalid") && t.includes("email")) return "Ese correo no es válido.";
  return m;
}

export async function iniciarSesion(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(form.get("contrasena") ?? "");
  const siguiente = String(form.get("next") ?? "/");
  if (!correo || !contrasena) return { error: "Captura correo y contraseña." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
  if (error) {
    if (error.message.toLowerCase().includes("not confirmed"))
      return { error: "Tu cuenta aún no está confirmada. Revisa tu correo (también en spam) o pide uno nuevo.", reenviar: true, correo };
    return { error: "Correo o contraseña incorrectos." };
  }
  redirect(siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/");
}

export async function registrarCuenta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(form.get("contrasena") ?? "");
  if (contrasena.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: correo,
    password: contrasena,
    options: { emailRedirectTo: `${sitio()}/auth/confirmar?next=/onboarding` },
  });
  if (error) return { error: errorCorreo(error.message) };
  // Supabase no avisa si el correo ya existe (por seguridad): devuelve un usuario sin identidades y no envía nada.
  if (data.user && (data.user.identities?.length ?? 0) === 0)
    return { error: "Ese correo ya tiene cuenta en Factory. Inicia sesión o usa «¿Olvidaste tu contraseña?»." };
  if (data.session) redirect("/onboarding");
  return { ok: `Te enviamos un correo a ${correo} para confirmar tu cuenta. Revisa también spam.`, reenviar: true, correo };
}

export async function reenviarConfirmacion(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  if (!correo) return { error: "Escribe tu correo." };
  const { error } = await (await createClient()).auth.resend({
    type: "signup",
    email: correo,
    options: { emailRedirectTo: `${sitio()}/auth/confirmar?next=/onboarding` },
  });
  if (error) return { error: errorCorreo(error.message), reenviar: true, correo };
  return { ok: `Listo, enviamos de nuevo el correo de confirmación a ${correo}.`, reenviar: true, correo };
}

export async function recuperarContrasena(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  if (!correo) return { error: "Escribe tu correo." };
  const { error } = await (await createClient()).auth.resetPasswordForEmail(correo, {
    redirectTo: `${sitio()}/auth/confirmar?next=/auth/contrasena`,
  });
  if (error) return { error: errorCorreo(error.message) };
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  return { ok: `Si ${correo} tiene cuenta, te llegará un enlace para definir una contraseña nueva.` };
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
