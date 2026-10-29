import { pestanasPilar, puedeAdministrar, puedeGestionarUsuarios, puedeSolicitar, infoPilar } from "@/lib/catalogos";
import { createClient } from "@/lib/supabase/server";
import { BarraPilar } from "./BarraPilar";
import type { Pilar, Sesion } from "@/lib/tipos";

/**
 * Barra lateral de un pilar, armada en el servidor: secciones según el rol, órdenes abiertas y los enlaces
 * generales (Historial, Configuración, Usuarios). La usan las páginas del pilar y también las generales,
 * que muestran la barra del último pilar abierto para que la navegación no cambie de forma.
 */
export async function BarraLateral({ pilar, perfil }: { pilar: Pilar; perfil: Sesion["perfil"] }) {
  const { count } = await (await createClient())
    .from("ordenes_mantenimiento")
    .select("id_orden", { count: "exact", head: true })
    .eq("pilar", pilar)
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);

  // Mismas reglas que el menú de cuenta (app/(app)/layout.tsx).
  const generales = [
    { href: "/historial", texto: "Historial", ver: perfil.rol !== "operaciones" },
    { href: "/configuracion", texto: "Configuración", ver: puedeAdministrar(perfil.rol) },
    { href: "/usuarios", texto: "Usuarios", ver: puedeGestionarUsuarios(perfil.rol) },
  ].filter((e) => e.ver).map(({ href, texto }) => ({ href, texto }));

  return (
    <BarraPilar items={pestanasPilar(pilar, perfil.rol)} generales={generales} abiertas={count ?? 0} pilar={infoPilar(pilar).etiqueta}
      slug={pilar} usuario={perfil.nombre}
      accion={puedeSolicitar(perfil.rol) ? { href: `/p/${pilar}/registro`, texto: perfil.rol === "operaciones" ? "Nueva solicitud" : "Registrar falla" } : null} />
  );
}
