"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar, ROLES } from "@/lib/catalogos";
import type { Pilar, Rol } from "@/lib/tipos";

const ROLES_VALIDOS = ROLES.map((r) => r.valor);

function volver(msg: string, error = false): never {
  revalidatePath("/usuarios");
  redirect(`/usuarios?${error ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

const leerPilares = (form: FormData) => form.getAll("pilares").map(String).filter(esPilar) as Pilar[];

export async function invitarUsuario(form: FormData) {
  const { perfil } = await exigirRol(["admin"]);
  const correo = String(form.get("correo") ?? "").trim().toLowerCase();
  const nombre = String(form.get("nombre") ?? "").trim();
  const rol = String(form.get("rol") ?? "tecnico") as Rol;
  const pilares = leerPilares(form);
  if (!/^\S+@\S+\.\S+$/.test(correo)) volver("Escribe un correo válido, por ejemplo nombre@empresa.com", true);
  if (!ROLES_VALIDOS.includes(rol)) volver("Elige un rol de la lista", true);
  if (rol !== "admin" && pilares.length === 0) volver("Marca al menos un pilar para este usuario", true);

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
  if (error) volver(error.message.includes("already") ? "Ese correo ya tiene cuenta en Factory" : error.message, true);

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
  const { perfil } = await exigirRol(["admin"]);
  const id = String(form.get("id"));
  const rol = String(form.get("rol")) as Rol;
  const activo = form.get("activo") === "on";
  const pilares = leerPilares(form);
  if (id === perfil.id && (rol !== "admin" || !activo)) volver("No puedes quitarte tu propio rol de administrador", true);
  if (!ROLES_VALIDOS.includes(rol)) volver("Elige un rol de la lista", true);
  if (rol !== "admin" && pilares.length === 0) volver("Marca al menos un pilar para este usuario", true);

  const { error } = await (await createClient()).from("usuarios_perfiles").update({ rol, activo, pilares }).eq("id", id);
  volver(error ? error.message : "Usuario actualizado", !!error);
}
