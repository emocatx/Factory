/** Mientras llega la lista, el encabezado y el selector se quedan y solo la lista muestra esqueleto. */
export default function CargandoOrdenes() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando órdenes…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="esqueleto h-6 w-48" />
        <div className="flex gap-3">
          <div className="esqueleto h-11 w-64" />
          <div className="esqueleto h-11 w-40" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="esqueleto h-40" />)}
      </div>
    </div>
  );
}
