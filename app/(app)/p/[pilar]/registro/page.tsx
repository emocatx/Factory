import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { createClient } from "@/lib/supabase/server";
import { puedeSolicitar } from "@/lib/catalogos";
import { redirect } from "next/navigation";
import { Encabezado } from "@/components/ui";
import { FormRegistro } from "./FormRegistro";

export const metadata = { title: "Registro" };

export default async function Registro({ params }: { params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  if (!puedeSolicitar(perfil.rol)) redirect(`/p/${pilar}/ordenes`);
  const [cat, { data: abiertas }] = await Promise.all([
    catalogosPilar(pilar),
    (await createClient()).from("ordenes_mantenimiento").select("id_equipo, folio_ticket")
      .eq("pilar", pilar).in("estatus_orden", ["pendiente", "asignada", "en_proceso"]).not("id_equipo", "is", null),
  ]);
  const detenidos = Object.fromEntries((abiertas ?? []).map((o) => [o.id_equipo as string, o.folio_ticket as string]));
  const operaciones = perfil.rol === "operaciones";

  return (
    <>
      <Encabezado

        titulo={operaciones || pilar === "dorsales" ? "Generar solicitud" : "Registro de ingreso"}
        sub={pilar === "dorsales"
          ? "La solicitud llega a mantenimiento con la línea; el almacén se define al cierre."
          : "Solo se registran equipos disponibles. Al registrar, el equipo queda detenido hasta que se libere su orden."}
      />
      <FormRegistro
        pilar={pilar}
        operaciones={operaciones}
        usuario={{ nombre: perfil.nombre, correo: perfil.correo }}
        almacenes={cat.almacenes}
        lineas={cat.lineas}
        equipos={cat.equipos}
        origenes={cat.origenes}
        detenidos={detenidos}
      />
    </>
  );
}
