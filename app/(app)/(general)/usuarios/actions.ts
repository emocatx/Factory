"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esPilar, etiquetaRol, ROLES_GESTORES, rolesQueOtorga, veTodosLosPilares } from "@/lib/catalogos";
import { randomInt } from "node:crypto";
import type { Pilar, Rol } from "@/lib/tipos";

/** Máximo de personas por alta en lote (también cuida el límite de correos de Supabase). */
const MAX_LOTE = 20;

function volver(msg: string, error = false): never {
  revalidatePath("/usuarios");
  redirect(`/usuarios?${error ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

const leerPilares = (form: FormData) => form.getAll("pilares").map(String).filter(esPilar) as Pilar[];

/** Uno o varios correos separados por coma, punto y coma, espacio o renglón; sin repetidos. */
function leerCorreos(form: FormData) {
  const crudo = String(form.get("correo") ?? "").toLowerCase();
  return [...new Set(crudo.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
}
const correoValido = (c: string) => /^\S+@\S+\.\S+$/.test(c);

/**
 * Valida rol y pilares contra lo que quien da de alta puede otorgar: altas en cascada y, salvo
 * administrador y gerente, solo con sus propios pilares. Devuelve el error o null.
 * (La clave de servicio se salta el RLS, así que esta es la regla que protege el alta.)
 */
function errorDeAlta(quien: Rol, misPilares: Pilar[], rol: Rol, pilares: Pilar[]) {
  const puede = rolesQueOtorga(quien);
  if (!puede.includes(rol)) return `Como ${etiquetaRol(quien).toLowerCase()} puedes dar de alta: ${puede.map((r) => etiquetaRol(r).toLowerCase()).join(", ")}.`;
  if (rol !== "admin" && rol !== "gerente" && pilares.length === 0) return "Marca al menos un pilar para este usuario.";
  if (!veTodosLosPilares(quien) && pilares.some((p) => !misPilares.includes(p))) return "Solo puedes asignar los pilares que tú tienes.";
  return null;
}

function servicio() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

export async function invitarUsuario(form: FormData) {
  const { perfil, pilares: misPilares } = await exigirRol(ROLES_GESTORES);
  const correos = leerCorreos(form);
  const nombre = String(form.get("nombre") ?? "").trim();
  const rol = String(form.get("rol") ?? "tecnico") as Rol;
  const pilares = leerPilares(form);
  if (!correos.length || correos.some((c) => !correoValido(c))) volver("Escribe correos válidos, por ejemplo nombre@empresa.com", true);
  if (correos.length > MAX_LOTE) volver(`Máximo ${MAX_LOTE} personas por alta.`, true);
  const err = errorDeAlta(perfil.rol, misPilares, rol, pilares);
  if (err) volver(err, true);

  const admin = servicio();
  if (!admin) volver("Configura SUPABASE_SERVICE_ROLE_KEY en el servidor para invitar usuarios", true);

  const enviadas: string[] = [];
  for (const correo of correos) {
    // tenant_id, rol y pilares van en app_metadata (solo editable con service role), nunca en user_metadata.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
      data: { nombre: correos.length === 1 ? nombre : "" },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
    });
    if (error) {
      const m = error.message.toLowerCase();
      const motivo = m.includes("already") ? "ya tiene cuenta en Factory"
        : m.includes("rate limit") ? "se alcanzó el límite de correos de Supabase (espera o configura un SMTP propio)"
        : m.includes("not authorized") ? "el correo de prueba de Supabase solo envía al equipo del proyecto (configura un SMTP propio)"
        : error.message;
      volver(`${enviadas.length ? `Enviadas: ${enviadas.join(", ")}. ` : ""}No se pudo invitar a ${correo}: ${motivo}`, true);
    }
    const { error: e2 } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { tenant_id: perfil.tenant_id, rol, pilares },
    });
    if (e2) volver(e2.message, true);
    // El trigger corre en el INSERT (antes de tener app_metadata), así que aseguramos el perfil aquí.
    const { error: e3 } = await admin.from("usuarios_perfiles").upsert({
      id: data.user.id,
      tenant_id: perfil.tenant_id,
      nombre: (correos.length === 1 && nombre) || correo.split("@")[0],
      correo,
      rol,
      pilares,
    });
    if (e3) volver(e3.message, true);
    enviadas.push(correo);
  }
  volver(enviadas.length === 1 ? `Invitación enviada a ${enviadas[0]}` : `${enviadas.length} invitaciones enviadas`);
}

export async function actualizarUsuario(form: FormData) {
  const { perfil, pilares: misPilares } = await exigirRol(ROLES_GESTORES);
  const id = String(form.get("id"));
  const rol = String(form.get("rol")) as Rol;
  const activo = form.get("activo") === "on";
  const pilares = leerPilares(form);
  if (id === perfil.id) volver(perfil.rol === "admin" && (rol !== "admin" || !activo) ? "No puedes quitarte tu propio rol de administrador" : "Tu propio rol lo cambia un administrador", true);
  const err = errorDeAlta(perfil.rol, misPilares, rol, pilares);
  if (err) volver(err, true);

  // RLS decide qué filas puede tocar cada quien (perfiles_update y perfiles_update_jerarquia);
  // si no devolvió fila, no tenía permiso sobre esa persona.
  const { data, error } = await (await createClient()).from("usuarios_perfiles").update({ rol, activo, pilares }).eq("id", id).select("id");
  if (error) volver(error.message.includes("row-level security") ? "No tienes permiso para dar ese rol o esos pilares." : error.message, true);
  if (!data?.length) volver("No tienes permiso para modificar a esta persona.", true);
  volver("Usuario actualizado");
}

export type Cuenta = { correo: string; clave: string };
export type EstadoAlta = { ok?: string; error?: string; cuentas?: Cuenta[] } | undefined;

/** Contraseña temporal legible (sin 0/O, 1/l/I) de 12 caracteres. */
function claveTemporal() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => a[randomInt(a.length)]).join("");
}

/**
 * Alta sin correo: crea una o varias cuentas con contraseña temporal (o adopta una cuenta ya
 * registrada que aún no pertenece a ninguna organización) y las liga a la organización con su rol
 * y pilares. En su primer ingreso se les pide cambiar la contraseña.
 */
export async function crearConContrasena(_: EstadoAlta, form: FormData): Promise<EstadoAlta> {
  const { perfil, pilares: misPilares } = await exigirRol(ROLES_GESTORES);
  const correos = leerCorreos(form);
  const nombreUnico = String(form.get("nombre") ?? "").trim();
  const rol = String(form.get("rol") ?? "tecnico") as Rol;
  const pilares = leerPilares(form);
  if (!correos.length || correos.some((c) => !correoValido(c))) return { error: "Escribe correos válidos, por ejemplo nombre@empresa.com" };
  if (correos.length > MAX_LOTE) return { error: `Máximo ${MAX_LOTE} personas por alta.` };
  const err = errorDeAlta(perfil.rol, misPilares, rol, pilares);
  if (err) return { error: err };

  const admin = servicio();
  if (!admin) return { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." };

  const cuentas: Cuenta[] = [];
  const fallidas: string[] = [];
  for (const correo of correos) {
    const nombre = (correos.length === 1 && nombreUnico) || correo.split("@")[0];
    const clave = claveTemporal();
    const meta = { tenant_id: perfil.tenant_id, rol, pilares, cambiar_contrasena: true };
    const { data: existente } = await admin.rpc("buscar_usuario_auth", { p_correo: correo });
    const fila = (existente as { id: string; tenant_id: string | null }[] | null)?.[0];
    let id: string;

    if (fila) {
      if (fila.tenant_id && fila.tenant_id !== perfil.tenant_id) { fallidas.push(`${correo} (pertenece a otra organización)`); continue; }
      if (fila.tenant_id === perfil.tenant_id) { fallidas.push(`${correo} (ya está en tu organización)`); continue; }
      // Cuenta registrada sin organización: se adopta y se le asigna contraseña temporal.
      const { error } = await admin.auth.admin.updateUserById(fila.id, { password: clave, email_confirm: true, app_metadata: meta, user_metadata: { nombre } });
      if (error) { fallidas.push(`${correo} (${error.message})`); continue; }
      id = fila.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true, app_metadata: meta, user_metadata: { nombre } });
      if (error || !data.user) { fallidas.push(`${correo} (${error?.message ?? "no se pudo crear"})`); continue; }
      id = data.user.id;
    }

    const { error: e2 } = await admin.from("usuarios_perfiles").upsert({ id, tenant_id: perfil.tenant_id, nombre, correo, rol, pilares, activo: true });
    if (e2) { fallidas.push(`${correo} (${e2.message})`); continue; }
    cuentas.push({ correo, clave });
  }

  revalidatePath("/usuarios");
  if (!cuentas.length) return { error: `No se dio de alta a nadie: ${fallidas.join("; ")}.` };
  const ok = cuentas.length === 1
    ? `${correos.length === 1 && nombreUnico ? nombreUnico : cuentas[0].correo} quedó dado de alta. Compártele estos datos; en su primer ingreso definirá su propia contraseña.`
    : `${cuentas.length} personas quedaron dadas de alta. Comparte a cada una sus datos; en su primer ingreso definirán su propia contraseña.`;
  return { ok: fallidas.length ? `${ok} No se pudo con: ${fallidas.join("; ")}.` : ok, cuentas };
}
