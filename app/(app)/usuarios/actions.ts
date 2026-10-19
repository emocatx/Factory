"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar, rolesQueOtorga } from "@/lib/catalogos";
import type { Pilar, Rol } from "@/lib/tipos";


function volver(msg: string, error = false): never {
  revalidatePath("/usuarios");
  redirect(`/usuarios?${error ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

const leerPilares = (form: FormData) => form.getAll("pilares").map(String).filter(esPilar) as Pilar[];

/** Valida rol y pilares contra lo que quien edita puede otorgar (el coordinador: su equipo y sus pilares). */
function validar(quien: Rol, misPilares: Pilar[], rol: Rol, pilares: Pilar[]) {
  if (!rolesQueOtorga(quien).includes(rol)) volver(quien === "coordinador" ? "Como coordinador puedes dar de alta supervisores, técnicos, operaciones y lectores." : "Elige un rol de la lista", true);
  if (rol !== "admin" && rol !== "gerente" && pilares.length === 0) volver("Marca al menos un pilar para este usuario", true);
  if (quien === "coordinador" && pilares.some((p) => !misPilares.includes(p))) volver("Solo puedes asignar los pilares que tú tienes.", true);
}

export async function invitarUsuario(form: FormData) {
  const { perfil, pilares: misPilares } = await exigirRol(["admin", "coordinador"]);
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(form.get("nombre") ?? "").trim();
  const rol = String(form.get("rol") ?? "tecnico") as Rol;
  const pilares = leerPilares(form);
  if (!/^\S+@\S+\.\S+$/.test(correo)) volver("Escribe un correo válido, por ejemplo nombre@empresa.com", true);
  validar(perfil.rol, misPilares, rol, pilares);

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    volver("Configura SUPABASE_SERVICE_ROLE_KEY en el servidor para invitar usuarios", true);
  }

  // tenant_id, rol y pilares van en app_metadata (solo editable con service role), nunca en user_metadata.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
    data: { nombre },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
  });
  if (error) {
    const m = error.message.toLowerCase();
    volver(
      m.includes("already") ? "Ese correo ya tiene cuenta en Factory"
      : m.includes("rate limit") ? "Se alcanzó el límite de correos de Supabase. Espera e inténtalo de nuevo, o configura un SMTP propio."
      : m.includes("not authorized") ? "El correo de prueba de Supabase solo envía al equipo del proyecto. Configura un SMTP propio para invitar a otras personas."
      : error.message,
      true,
    );
  }

  const { error: e2 } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { tenant_id: perfil.tenant_id, rol, pilares },
  });
  if (e2) volver(e2.message, true);

  // El trigger corre en el INSERT (antes de tener app_metadata), así que aseguramos el perfil aquí.
  const { error: e3 } = await admin.from("usuarios_perfiles").upsert({
    id: data.user.id,
    tenant_id: perfil.tenant_id,
    nombre: nombre || correo.split("@")[0],
    correo,
    rol,
    pilares,
  });
  if (e3) volver(e3.message, true);
  volver(`Invitación enviada a ${correo}`);
}

export async function actualizarUsuario(form: FormData) {
  const { perfil, pilares: misPilares } = await exigirRol(["admin", "coordinador"]);
  const id = String(form.get("id"));
  const rol = String(form.get("rol")) as Rol;
  const activo = form.get("activo") === "on";
  const pilares = leerPilares(form);
  if (id === perfil.id) volver(perfil.rol === "admin" && (rol !== "admin" || !activo) ? "No puedes quitarte tu propio rol de administrador" : "Tu propio rol lo cambia un administrador", true);
  validar(perfil.rol, misPilares, rol, pilares);

  // RLS decide qué filas puede tocar cada quien; si no devolvió fila, no tenía permiso sobre esa persona.
  const { data, error } = await (await createClient()).from("usuarios_perfiles").update({ rol, activo, pilares }).eq("id", id).select("id");
  if (error) volver(error.message.includes("row-level security") ? "No tienes permiso para dar ese rol o esos pilares." : error.message, true);
  if (!data?.length) volver("No tienes permiso para modificar a esta persona.", true);
  volver("Usuario actualizado");
}
