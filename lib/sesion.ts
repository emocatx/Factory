import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { esPilar } from "./catalogos";
import type { Pilar, Rol, Sesion } from "./tipos";

/** Perfil + tenant del usuario autenticado. Redirige a login u onboarding si falta algo. */
export const obtenerSesion = cache(async (): Promise<Sesion> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_perfiles")
    .select("id, tenant_id, nombre, correo, rol, pilares, activo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil) redirect("/onboarding");
  if (!perfil.activo) redirect("/login?error=inactivo");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, nombre_empresa, zona_horaria, pilares_activos, meta_mttr_horas, meta_mtbf_horas, meta_disponibilidad_pct")
    .eq("id", perfil.tenant_id)
    .single();

  const activos = (tenant?.pilares_activos ?? []) as Pilar[];
  const propios = perfil.rol === "admin" ? activos : (perfil.pilares as Pilar[]).filter((p) => activos.includes(p));
  return { perfil, tenant, pilares: propios } as Sesion;
});

export async function exigirRol(roles: Rol[]) {
  const s = await obtenerSesion();
  if (!roles.includes(s.perfil.rol)) redirect("/?error=permiso");
  return s;
}

/** Valida el segmento [pilar] de la URL y que el usuario tenga acceso a él. */
export async function sesionDePilar(valor: string) {
  if (!esPilar(valor)) notFound();
  const s = await obtenerSesion();
  if (!s.pilares.includes(valor)) redirect("/?error=pilar");
  return { ...s, pilar: valor as Pilar };
}
