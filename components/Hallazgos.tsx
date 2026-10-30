import Link from "next/link";
import type { Hallazgo } from "@/lib/hallazgos";

/** Urgencia, no categoría: rojo lo que detiene equipos hoy, naranja lo que se está atrasando, azul las sugerencias. */
const PUNTO: Record<Hallazgo["tono"], string> = { paro: "bg-paro", alerta: "bg-alerta", info: "bg-azul" };

/** Lista de hallazgos (ver lib/hallazgos.ts): el hallazgo con su número, por qué importa y una acción a un clic. */
export function ListaHallazgos({ hallazgos }: { hallazgos: Hallazgo[] }) {
  return (
    <ul className="divide-y divide-papel">
      {hallazgos.map((h) => (
        <li key={h.clave} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${PUNTO[h.tono]}`} />
          <div className="min-w-0">
            <p className="text-[15px] leading-snug">{h.texto}</p>
            {h.porque && <p className="mt-1 text-[13px] text-suave">{h.porque}</p>}
            {h.accion && <Link href={h.accion.href} className="enlace mt-1.5 text-[14px] font-semibold">{h.accion.texto} ›</Link>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tarjeta de hallazgos para las páginas planas. Sin hallazgos no se muestra: nada destaca. */
export function TarjetaHallazgos({ hallazgos, alcance, max = 3 }: { hallazgos: Hallazgo[]; alcance: string; max?: number }) {
  if (!hallazgos.length) return null;
  const resto = hallazgos.length - max;
  return (
    <section className="caja-panel p-5" aria-labelledby="hallazgos-tit">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="hallazgos-tit" className="text-[17px] font-semibold">Hallazgos</h2>
        <p className="text-[13px] text-suave">{alcance} · últimos 30 días</p>
      </div>
      <ListaHallazgos hallazgos={hallazgos.slice(0, max)} />
      {resto > 0 && <p className="mt-3 text-[13px] text-suave">Y {resto} más de menor prioridad.</p>}
    </section>
  );
}
