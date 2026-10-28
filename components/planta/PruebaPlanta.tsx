"use client";

// Página de prueba del prototipo de planta: elegir ficha de almacén y vista por pilar, con medidor.
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTema, InterruptorTema } from "@/components/Tema";
import { distribuir, FICHAS } from "./ficha";
import type { Medicion, Vista } from "./Planta3D";

const Planta3D = dynamic(() => import("./Planta3D"), { ssr: false, loading: () => <p className="p-8 text-suave">Cargando la planta…</p> });

const VISTAS: { v: Vista; t: string }[] = [
  { v: "moviles", t: "Móviles" }, { v: "criticos", t: "Críticos" }, { v: "inmuebles", t: "Inmuebles" }, { v: "todos", t: "Todos" },
];

export function PruebaPlanta() {
  const oscuro = useTema() === "oscuro";
  const [id, setId] = useState(FICHAS[0].id);
  const [vista, setVista] = useState<Vista>("moviles");
  const [m, setM] = useState<Medicion | null>(null);
  const ficha = FICHAS.find((f) => f.id === id)!;
  const d = useMemo(() => distribuir(ficha), [ficha]);
  const enTaller = d.montacargas.filter((x) => x.estado === "paro").length;
  const fallas = d.activos.filter((a) => a.estado === "paro").length + d.andenes.filter((a) => a.estado === "paro").length;

  return (
    <div className="relative h-dvh overflow-hidden bg-papel">
      <div className="absolute inset-0"><Planta3D d={d} clave={id} vista={vista} oscuro={oscuro} onMedir={setM} /></div>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-[22px] vidrio px-5 py-4">
          <p className="text-[12px] text-suave">Prototipo · plantilla de nave</p>
          <h1 className="text-[22px] font-semibold tracking-tight">{ficha.nombre}</h1>
          <p className="mt-1 text-[13px] text-suave">
            {ficha.andenes} andenes{ficha.dosLados ? " (2 lados)" : ""} · {ficha.pasillos} pasillos · {Math.round(d.ancho)} × {Math.round(d.fondo)} m
          </p>
          <p className="text-[13px] text-suave">{d.montacargas.length} montacargas ({enTaller} en Mantto) · {d.activos.length} activos · {fallas} activos o andenes en falla</p>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full vidrio py-1 pl-4 pr-1">
            <label htmlFor="ficha" className="text-[13px] text-suave">Almacén</label>
            <select id="ficha" value={id} onChange={(e) => setId(e.target.value)} className="selector min-h-9 w-auto rounded-full border-0 bg-panel-2 py-0 pl-3.5 text-[14px] font-semibold">
              {FICHAS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <nav aria-label="Vista por pilar" className="inline-flex rounded-full vidrio p-1">
            {VISTAS.map((x) => (
              <button key={x.v} type="button" onClick={() => setVista(x.v)} aria-pressed={vista === x.v}
                className={`min-h-9 cursor-pointer rounded-full px-3.5 text-[14px] ${vista === x.v ? "bg-tinta font-semibold text-sobre-tinta" : "text-suave hover:text-tinta"}`}>{x.t}</button>
            ))}
          </nav>
          <div className="w-[190px] rounded-full vidrio"><InterruptorTema /></div>
        </div>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4">
        <ul className="pointer-events-auto flex flex-wrap gap-3 rounded-full vidrio px-4 py-2 text-[13px]">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ok" />Opera / OK</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-renta" />Renta</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-paro" />Mantto / falla</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-panel-2 ring-1 ring-borde" />Otro pilar (contexto)</li>
        </ul>
        {m && (
          <p className="pointer-events-auto rounded-full vidrio px-4 py-2 font-mono text-[12px] tabular-nums" aria-live="off">
            {m.fps} fps · {m.llamadas} llamadas · {(m.triangulos / 1000).toFixed(0)}k triángulos · {m.geometrias} geometrías · {m.texturas} texturas
          </p>
        )}
      </footer>
    </div>
  );
}
