import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { puedeSolicitar } from "@/lib/catalogos";
import { redirect } from "next/navigation";
import { Encabezado } from "@/components/ui";
import { FormRegistro } from "./FormRegistro";

export const metadata = { title: "Registro" };

export default async function Registro({ params }: { params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  if (!puedeSolicitar(perfil.rol)) redirect(`/p/${pilar}/ordenes`);
  const cat = await catalogosPilar(pilar);
  const operaciones = perfil.rol === "operaciones";

  return (
    <>
      <Encabezado

        titulo={operaciones || pilar === "dorsales" ? "Generar solicitud" : "Registro de ingreso"}
        sub={pilar === "dorsales"
          ? "La solicitud llega a mantenimiento con la línea; el almacén se define al cierre."
          : "Al registrar, el equipo queda En paro hasta que se concluya la orden."}
      />
      <FormRegistro
        pilar={pilar}
        operaciones={operaciones}
        usuario={{ nombre: perfil.nombre, correo: perfil.correo }}
        almacenes={cat.almacenes}
        lineas={cat.lineas}
        equipos={cat.equipos}
        origenes={cat.origenes}
      />
    </>
  );
}
