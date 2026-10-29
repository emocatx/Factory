import { cookies } from "next/headers";
import { obtenerSesion } from "@/lib/sesion";
import { ContenidoPilar } from "@/components/BarraPilar";
import { COOKIE_PILAR } from "@/lib/navegacion";
import { BarraLateral } from "@/components/BarraLateral";
import type { Pilar } from "@/lib/tipos";

/**
 * Historial, Configuración y Usuarios: conservan la barra lateral del último pilar abierto (cookie que deja
 * BarraPilar), así la navegación no cambia de forma al salir del pilar. Sin pilar a la mano, el primero que
 * la persona puede ver; si no tiene ninguno, la página va sola en una columna centrada.
 */
export default async function LayoutGeneral({ children }: { children: React.ReactNode }) {
  const { perfil, pilares } = await obtenerSesion();
  const ultimo = (await cookies()).get(COOKIE_PILAR)?.value as Pilar | undefined;
  const pilar = ultimo && pilares.includes(ultimo) ? ultimo : pilares[0];
  if (!pilar) return <div className="mx-auto max-w-[1240px] pt-4">{children}</div>;
  return (
    <div className="lg:grid lg:grid-cols-[56px_minmax(0,1fr)] lg:gap-3">
      <BarraLateral pilar={pilar} perfil={perfil} />
      <ContenidoPilar>{children}</ContenidoPilar>
    </div>
  );
}
