import { sesionDePilar } from "@/lib/sesion";
import { ContenidoPilar } from "@/components/BarraPilar";
import { BarraLateral } from "@/components/BarraLateral";

export default async function LayoutPilar({ children, params }: { children: React.ReactNode; params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);

  // Barra lateral de secciones + contenido a todo el ancho (ver components/BarraPilar).
  return (
    <div className="lg:grid lg:grid-cols-[56px_minmax(0,1fr)] lg:gap-3">
      <BarraLateral pilar={pilar} perfil={perfil} />
      <ContenidoPilar>{children}</ContenidoPilar>
    </div>
  );
}
