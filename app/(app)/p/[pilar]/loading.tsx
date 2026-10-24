import { Esqueleto } from "@/components/ui";

/** Al cambiar de pestaña del pilar, las pestañas se quedan y el contenido muestra esqueleto al instante. */
export default function CargandoPilar() {
  return <Esqueleto filas={3} />;
}
