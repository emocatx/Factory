import { sesionDePilar } from "@/lib/sesion";
import { infoPilar, pestanasPilar, puedeAdministrar, puedeGestionarUsuarios, puedeSolicitar } from "@/lib/catalogos";
import { createClient } from "@/lib/supabase/server";
import { BarraPilar, ContenidoPilar } from "@/components/BarraPilar";

export default async function LayoutPilar({ children, params }: { children: React.ReactNode; params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  const info = infoPilar(pilar);
  const { count } = await (await createClient())
    .from("ordenes_mantenimiento")
    .select("id_orden", { count: "exact", head: true })
    .eq("pilar", pilar)
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);

  // Mismas reglas que la barra superior de la app (app/(app)/layout.tsx).
  const generales = [
    { href: "/historial", texto: "Historial", ver: perfil.rol !== "operaciones" },
    { href: "/configuracion", texto: "Configuración", ver: puedeAdministrar(perfil.rol) },
    { href: "/usuarios", texto: "Usuarios", ver: puedeGestionarUsuarios(perfil.rol) },
  ].filter((e) => e.ver).map(({ href, texto }) => ({ href, texto }));

  // Barra lateral de secciones + contenido a todo el ancho (ver components/BarraPilar).
  return (
    <div className="lg:grid lg:grid-cols-[56px_minmax(0,1fr)] lg:gap-3">
      <BarraPilar items={pestanasPilar(pilar, perfil.rol)} generales={generales} abiertas={count ?? 0} pilar={info.etiqueta}
        usuario={perfil.nombre}
        accion={puedeSolicitar(perfil.rol) ? { href: `/p/${pilar}/registro`, texto: perfil.rol === "operaciones" ? "Nueva solicitud" : "Registrar falla" } : null} />
      <ContenidoPilar>{children}</ContenidoPilar>
    </div>
  );
}
