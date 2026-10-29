"use client";

import { useState, useTransition } from "react";
import { Desplegable } from "@/components/Desplegable";
import { FormFiltros } from "@/components/FormFiltros";
import { marcarHecho } from "./acciones";

/** Almacén de la pantalla Planes; se aplica al elegir (sin recargar), conservando la vista. */
export function SelectorAlmacen({ valor, vista, opciones }: {
  valor: string;
  vista: string;
  opciones: { valor: string; etiqueta: string }[];
}) {
  return (
    <FormFiltros className="relative z-30">
      {vista !== "planes" && <input type="hidden" name="vista" value={vista} />}
      <Desplegable key={valor} id="planes-almacen" name="almacen" etiqueta="Almacén" compacto autoEnviar defaultValue={valor} opciones={opciones} />
      <button className="sr-only">Aplicar</button>
    </FormFiltros>
  );
}

/** Marca como hechos los servicios de una entrada de la semana: el último servicio pasa a hoy y el siguiente se recorre. */
export function BotonHecho({ pilar, ids }: { pilar: string; ids: string[] }) {
  const [pend, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <button type="button" disabled={pend} title={error ?? `Marcar ${ids.length} como hecho hoy`}
      onClick={() => start(async () => { const r = await marcarHecho(pilar, ids); setError(r.ok ? undefined : r.mensaje); })}
      className={`chip cursor-pointer ${error ? "bg-paro-suave text-paro-texto" : "bg-panel-2 text-tinta hover:bg-ok-suave hover:text-ok-texto"}`}>
      {pend ? "Guardando…" : error ? "Error" : "Hecho"}
    </button>
  );
}
