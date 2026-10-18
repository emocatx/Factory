"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoTendencia } from "@/lib/tipos";

function etiqueta(iso: string, grano: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (grano === "anio") return String(d.getFullYear());
  if (grano === "mes") return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

/** Ingresos vs cierres. Leyenda escrita (no solo color) y tabla accesible equivalente. */
export function GraficaTendencia({ datos, grano }: { datos: PuntoTendencia[]; grano: string }) {
  const filas = datos.map((d) => ({ ...d, x: etiqueta(d.periodo, grano) }));
  const ing = filas.reduce((s, f) => s + f.ingresadas, 0);
  const cie = filas.reduce((s, f) => s + f.cerradas, 0);
  return (
    <figure>
      <figcaption className="mb-4 flex flex-wrap gap-5 text-[15px]">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-alerta" aria-hidden="true" />Ingresos: <strong>{ing}</strong></span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-tinta" aria-hidden="true" />Cierres: <strong>{cie}</strong></span>
      </figcaption>
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer>
          <BarChart data={filas} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barGap={3}>
            <CartesianGrid vertical={false} stroke="#ffffff" strokeWidth={2} />
            <XAxis dataKey="x" tickLine={false} axisLine={false} fontSize={13} stroke="#55585e" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={13} stroke="#55585e" />
            <Tooltip
              cursor={{ fill: "#e9e9e6" }}
              contentStyle={{ borderRadius: 12, border: 0, fontSize: 14, boxShadow: "0 8px 24px rgb(17 18 20 / 0.14)" }}
              formatter={(v, n) => [v, n === "ingresadas" ? "Ingresos" : "Cierres"]}
            />
            <Bar dataKey="ingresadas" fill="#f08c00" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="cerradas" fill="#111214" radius={[6, 6, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Ingresos y cierres por periodo</caption>
        <thead><tr><th>Periodo</th><th>Ingresos</th><th>Cierres</th></tr></thead>
        <tbody>{filas.map((f) => <tr key={f.periodo}><td>{f.x}</td><td>{f.ingresadas}</td><td>{f.cerradas}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
