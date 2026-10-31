"use client";

// Ficha de la nave de un almacén (andenes, pasillos y si los andenes van en los dos lados), con la que se arma en 3D.
// Sale del programa anual de Infraestructura; lo que se captura aquí queda como manual y el programa ya no lo cambia.
import { useState, useTransition } from "react";
import { enteroFicha } from "@/lib/planAnual";
import { guardarFichaAlmacen } from "./acciones";

export type Ficha = { andenes?: number; pasillos?: number; dosLados?: boolean; manual?: string[]; fuente?: string; actualizado?: string } | null;

const ETIQUETA: Record<string, string> = { andenes: "andenes", pasillos: "pasillos", dosLados: "dos lados" };

export function FichaAlmacen({ id, nombre, ficha, editable }: { id: string; nombre: string; ficha: Ficha; editable: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [andenes, setAndenes] = useState(ficha?.andenes?.toString() ?? "");
  const [pasillos, setPasillos] = useState(ficha?.pasillos?.toString() ?? "");
  const [dosLados, setDosLados] = useState(!!ficha?.dosLados);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();

  const manual = (ficha?.manual ?? []).filter((k) => ETIQUETA[k]);
  const origen = manual.length ? `Manual: ${manual.map((k) => ETIQUETA[k]).join(", ")}` : ficha?.fuente === "programa-anual" ? "Del programa" : null;
  const partes = [
    ficha?.andenes !== undefined && `${ficha.andenes} andenes${ficha.dosLados ? " en dos lados" : ""}`,
    ficha?.pasillos !== undefined && `${ficha.pasillos} pasillos`,
  ].filter(Boolean);

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const malAndenes = andenes.trim() !== "" && !enteroFicha(num(andenes)), malPasillos = pasillos.trim() !== "" && !enteroFicha(num(pasillos));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (malAndenes || malPasillos) { setMsg({ ok: false, texto: "Andenes y pasillos: enteros de 0 a 500." }); return; }
    // lo escrito queda como manual; "dos lados" solo si cambió, para no marcar como manual lo que nadie tocó
    const cambios = { andenes: num(andenes), pasillos: num(pasillos), ...(dosLados !== !!ficha?.dosLados ? { dosLados } : {}) };
    if (cambios.andenes === undefined && cambios.pasillos === undefined && !("dosLados" in cambios)) { setMsg({ ok: false, texto: "Escribe andenes o pasillos." }); return; }
    setMsg(null);
    iniciar(async () => {
      const r = await guardarFichaAlmacen(id, cambios)
        .catch(() => ({ ok: false, mensaje: "No se pudo guardar. Revisa tu conexión." }));
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok) setAbierta(false);
    });
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-suave">
        <span>{partes.length ? partes.join(" · ") : "Sin ficha de nave"}</span>
        {origen && <span className={`chip ${manual.length ? "bg-info-suave text-info-texto" : "bg-panel text-suave"}`}>{origen}</span>}
        {editable && (
          <button type="button" onClick={() => { setAbierta((v) => !v); setMsg(null); }} aria-expanded={abierta} aria-controls={`ficha-${id}`}
            className="enlace inline-flex min-h-10 cursor-pointer items-center text-[13px]">
            {abierta ? "Cancelar" : "Editar ficha"}
          </button>
        )}
      </div>
      {msg && !abierta && <p role="status" className={`text-[13px] ${msg.ok ? "text-ok-texto" : "text-paro-texto"}`}>{msg.texto}</p>}
      {abierta && (
        <form id={`ficha-${id}`} onSubmit={guardar} className="entrar mt-2 flex flex-wrap items-end gap-3 rounded-[12px] bg-panel p-3">
          <label className="w-24">
            <span className="etiqueta">Andenes</span>
            <input type="number" inputMode="numeric" min={0} max={500} step={1} value={andenes} onChange={(e) => setAndenes(e.target.value)}
              aria-invalid={malAndenes || undefined} className="campo min-h-10" aria-label={`Andenes de ${nombre}`} />
          </label>
          <label className="w-24">
            <span className="etiqueta">Pasillos</span>
            <input type="number" inputMode="numeric" min={0} max={500} step={1} value={pasillos} onChange={(e) => setPasillos(e.target.value)}
              aria-invalid={malPasillos || undefined} className="campo min-h-10" aria-label={`Pasillos de ${nombre}`} />
          </label>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-[14px]">
            <input type="checkbox" checked={dosLados} onChange={(e) => setDosLados(e.target.checked)} className="h-5 w-5" />
            Andenes en los dos lados
          </label>
          <button type="submit" disabled={guardando} aria-busy={guardando} className="btn-sec min-h-10 px-4 text-[14px] disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar ficha"}
          </button>
          {msg && <p role="alert" className="w-full text-[13px] text-paro-texto">{msg.texto}</p>}
        </form>
      )}
    </div>
  );
}
