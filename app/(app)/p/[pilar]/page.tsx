import { redirect } from "next/navigation";
import { sesionDePilar } from "@/lib/sesion";

export default async function Pilar({ params }: { params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  // Operaciones no tiene Resumen: entra directo a su seguimiento.
  redirect(`/p/${pilar}/${perfil.rol === "operaciones" ? "ordenes" : "resumen"}`);
}
