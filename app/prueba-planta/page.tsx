import { notFound } from "next/navigation";
import { PruebaPlanta } from "@/components/planta/PruebaPlanta";

export const metadata = { title: "Prototipo de planta" };

// Solo en desarrollo: prototipo de la plantilla de nave.
export default function Pagina() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PruebaPlanta />;
}
