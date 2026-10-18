import { Esqueleto } from "@/components/ui";

export default function Cargando() {
  return (
    <div className="pt-6">
      <Esqueleto filas={4} />
    </div>
  );
}
