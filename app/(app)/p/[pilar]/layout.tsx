import Link from "next/link";
import { sesionDePilar } from "@/lib/sesion";
import { infoPilar, pestanasPilar } from "@/lib/catalogos";
import { createClient } from "@/lib/supabase/server";
import { SeccionesPilar } from "@/components/SeccionesPilar";

export default async function LayoutPilar({ children, params }: { children: React.ReactNode; params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  const info = infoPilar(pilar);
  const { count } = await (await createClient())
    .from("ordenes_mantenimiento")
    .select("id_orden", { count: "exact", head: true })
    .eq("pilar", pilar)
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);

  return (
    <>
      <Link href="/" className="enlace text-[14px]">‹ Pilares</Link>
      <p className="mt-2 text-[48px] font-semibold leading-none tracking-[-0.03em] md:text-[80px]">{info.etiqueta}</p>
      <div className="mt-8 md:mt-10">
        <SeccionesPilar items={pestanasPilar(pilar, perfil.rol)} abiertas={count ?? 0} />
      </div>
      <div className="mt-8 border-t border-panel-2 pt-10">{children}</div>
    </>
  );
}
