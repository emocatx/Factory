import Link from "next/link";
import { obtenerSesion } from "@/lib/sesion";
import { puedeAdministrar, puedeGestionarUsuarios } from "@/lib/catalogos";
import { Marca } from "@/components/Marca";
import { EnVivo } from "@/components/EnVivo";
import { MenuUsuario } from "@/components/MenuUsuario";
import { Tour } from "@/components/Tour";
import { Ancho, FueraDePilar } from "@/components/Ancho";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil, tenant, tourVisto } = await obtenerSesion();
  const enlaces = [
    { href: "/historial", texto: "Historial", ver: perfil.rol !== "operaciones" },
    { href: "/configuracion", texto: "Configuración", ver: puedeAdministrar(perfil.rol) },
    { href: "/usuarios", texto: "Usuarios", ver: puedeGestionarUsuarios(perfil.rol) },
  ].filter((e) => e.ver);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl backdrop-saturate-150">
        <Ancho pilar="flex items-center justify-between gap-x-6 gap-y-2 px-4 py-2 md:px-5"
          normal="mx-auto flex max-w-[1240px] items-center justify-between gap-x-6 gap-y-2 px-4 py-2 md:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Inicio: elegir pilar"><Marca /></Link>
            <span className="hidden max-w-[220px] truncate text-sm text-suave md:inline" title={tenant.nombre_empresa}>
              {tenant.nombre_empresa}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FueraDePilar>
            <nav aria-label="General" className="hidden items-center gap-1 text-[14px] lg:flex">
              {enlaces.map((e) => (
                <Link key={e.href} href={e.href} className="rounded-full px-3 py-2 text-tinta/80 hover:text-tinta">
                  {e.texto}
                </Link>
              ))}
            </nav>
            </FueraDePilar>
            <EnVivo tenantId={tenant.id} />
            <MenuUsuario nombre={perfil.nombre} correo={perfil.correo} rol={perfil.rol} empresa={tenant.nombre_empresa} enlaces={enlaces} />
          </div>
        </Ancho>
      </header>
      <Ancho como="main" pilar="px-3 pb-6 pt-3 md:px-4" normal="mx-auto max-w-[1240px] px-4 pb-24 pt-8 md:px-8 md:pt-12">{children}</Ancho>
      <Tour rol={perfil.rol} empresa={tenant.nombre_empresa} nombre={perfil.nombre} visto={tourVisto} />
    </div>
  );
}
