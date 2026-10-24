import Link from "next/link";
import type { Pilar } from "@/lib/tipos";

/** Selector de la sección Órdenes: abiertas y cerradas conviven bajo la misma pestaña. */
export function VistaOrdenes({ pilar, actual, abiertas }: { pilar: Pilar; actual: "abiertas" | "cerradas"; abiertas?: number }) {
  const vistas = [
    { v: "abiertas", t: abiertas !== undefined ? `Abiertas · ${abiertas}` : "Abiertas", href: `/p/${pilar}/ordenes` },
    { v: "cerradas", t: "Cerradas", href: `/p/${pilar}/cerradas` },
  ] as const;
  return (
    <nav aria-label="Vista de órdenes" className="inline-flex rounded-full bg-panel-2 p-1">
      {vistas.map((x) => (
        <Link key={x.v} href={x.href} aria-current={x.v === actual ? "page" : undefined}
          className={`flex min-h-10 items-center rounded-full px-4 text-[15px] tabular-nums ${x.v === actual ? "bg-panel font-semibold shadow-sm" : "text-suave hover:text-tinta"}`}>
          {x.t}
        </Link>
      ))}
    </nav>
  );
}
