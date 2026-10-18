import Link from "next/link";
import { obtenerSesion } from "@/lib/sesion";
import { esAdmin, etiquetaRol, puedeAdministrar } from "@/lib/catalogos";
import { Marca } from "@/components/Marca";
import { EnVivo } from "@/components/EnVivo";
import { cerrarSesion } from "@/app/login/actions";
import { BotonEnviar } from "@/components/BotonEnviar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil, tenant } = await obtenerSesion();
  const enlaces = [
    { href: "/historial", texto: "Historial", ver: perfil.rol !== "operaciones" },
    { href: "/configuracion", texto: "Configuración", ver: puedeAdministrar(perfil.rol) },
    { href: "/usuarios", texto: "Usuarios", ver: esAdmin(perfil.rol) },
  ].filter((e) => e.ver);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-x-6 gap-y-2 px-4 py-2 md:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Inicio: elegir pilar"><Marca /></Link>
            <span className="hidden max-w-[220px] truncate text-sm text-suave md:inline" title={tenant.nombre_empresa}>
              {tenant.nombre_empresa}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <nav aria-label="General" className="hidden items-center gap-1 text-[14px] lg:flex">
              {enlaces.map((e) => (
                <Link key={e.href} href={e.href} className="rounded-full px-3 py-2 text-tinta/80 hover:text-tinta">
                  {e.texto}
                </Link>
              ))}
            </nav>
            <EnVivo tenantId={tenant.id} />
            <details className="relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full bg-papel py-1 pl-1 pr-3 text-sm hover:bg-panel-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tinta text-[13px] font-semibold text-white" aria-hidden="true">
                  {perfil.nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="hidden font-medium sm:inline">{perfil.nombre.split(" ")[0]}</span>
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-64 rounded-[18px] bg-panel p-4 shadow-[0_12px_32px_rgb(17_18_20/0.16)]">
                <p className="font-semibold">{perfil.nombre}</p>
                <p className="text-sm text-suave">{perfil.correo}</p>
                <p className="mt-2 text-sm text-suave">{etiquetaRol(perfil.rol)}</p>
                {enlaces.length > 0 && (
                  <nav aria-label="General (móvil)" className="mt-3 flex flex-col border-t border-panel pt-2 lg:hidden">
                    {enlaces.map((e) => (
                      <Link key={e.href} href={e.href} className="flex min-h-11 items-center rounded-xl px-2 text-[15px] hover:bg-panel">{e.texto}</Link>
                    ))}
                  </nav>
                )}
                <form action={cerrarSesion} className="mt-4">
                  <BotonEnviar className="btn-sec w-full min-h-10 text-sm" pendiente="Saliendo…">Cerrar sesión</BotonEnviar>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-8 md:px-8 md:pt-12">{children}</main>
    </div>
  );
}
