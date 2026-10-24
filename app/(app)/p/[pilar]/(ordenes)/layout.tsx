import { sesionDePilar } from "@/lib/sesion";
import { EncabezadoOrdenes } from "@/components/VistaOrdenes";

/** Sección Órdenes: abiertas y cerradas comparten encabezado y selector. */
export default async function LayoutOrdenes({ children, params }: { children: React.ReactNode; params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  return (
    <>
      <EncabezadoOrdenes pilar={pilar} operaciones={perfil.rol === "operaciones"} />
      {children}
    </>
  );
}
