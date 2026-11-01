"use client";

// Carga de la distribución real de la nave (el <almacén>.distribucion.json que deja el planeador).
// Se lee en el navegador, se revisa con compactarDistribucion y solo se guarda al presionar el botón.
import { useId, useState, useTransition } from "react";
import { andenesQueOperan, compactarDistribucion, type Distribucion } from "@/lib/distribucion";
import { guardarDistribucionAlmacen } from "./acciones";

const MAX_BYTES = 300_000;

const fecha = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
};

const resumen = (d: Distribucion) => {
  const rampas = d.andenes.filter((a) => a.tipo === "rampa").length;
  return [
    `Nave ${d.nave.largo} × ${d.nave.ancho} m`,
    `${andenesQueOperan(d)} andenes que operan`,
    `${rampas} ${rampas === 1 ? "rampa" : "rampas"}`,
    `${d.racks.length} ${d.racks.length === 1 ? "rack" : "racks"}`,
    `${d.zonas.length} ${d.zonas.length === 1 ? "zona" : "zonas"}`,
  ];
};

export function DistribucionPlano({ id, nombre, actual, editable }: { id: string; nombre: string; actual: Distribucion | null | undefined; editable: boolean }) {
  const inputId = useId();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [archivo, setArchivo] = useState("");
  const [previa, setPrevia] = useState<Distribucion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();

  if (!actual && !editable) return null;

  function limpiar() { setTexto(null); setArchivo(""); setPrevia(null); setError(null); }

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    limpiar(); setMsg(null);
    if (!f) return;
    setArchivo(f.name);
    if (f.size > MAX_BYTES) { setError("El archivo pesa más de 300 KB."); return; }
    try {
      const t = await f.text();
      const r = compactarDistribucion(JSON.parse(t), new Date().toLocaleDateString("en-CA"));
      if ("error" in r) setError(r.error);
      else { setPrevia(r.distribucion); setTexto(t); }
    } catch {
      setError("El archivo no es un JSON válido.");
    }
  }

  function guardar() {
    if (texto === null) return;
    setMsg(null);
    iniciar(async () => {
      const r = await guardarDistribucionAlmacen(id, texto)
        .catch(() => ({ ok: false, mensaje: "No se pudo guardar. Revisa tu conexión." }));
      setMsg({ ok: r.ok, texto: r.mensaje });
      if (r.ok) { limpiar(); setAbierta(false); }
    });
  }

  return (
    <div className="mt-1 w-full text-[13px] text-suave">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {actual
            ? <>Distribución del plano · {actual.fuente} · {fecha(actual.actualizado)}: {resumen(actual).join(" · ")}</>
            : "Sin distribución del plano"}
        </span>
        {editable && (
          <button type="button" onClick={() => { setAbierta((v) => !v); setMsg(null); limpiar(); }} aria-expanded={abierta} aria-controls={`dist-${id}`}
            className="enlace inline-flex min-h-10 cursor-pointer items-center text-[13px]">
            {abierta ? "Cancelar" : actual ? "Reemplazar distribución" : "Cargar distribución"}
          </button>
        )}
      </div>
      {msg && !abierta && <p role="status" className={msg.ok ? "text-ok-texto" : "text-paro-texto"}>{msg.texto}</p>}
      {abierta && (
        <div id={`dist-${id}`} className="entrar mt-2 flex flex-col gap-3 rounded-[12px] bg-panel p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={inputId} className="btn-sec inline-flex min-h-10 cursor-pointer items-center px-4 text-[14px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
              Elegir archivo .json
              <input id={inputId} type="file" accept=".json,application/json" onChange={elegir} className="sr-only" aria-label={`Distribución del plano de ${nombre}`} />
            </label>
            {archivo && <span className="min-w-0 break-all text-[13px]">{archivo}</span>}
          </div>
          {error && <p role="alert" className="text-[13px] text-paro-texto">{error}</p>}
          {previa && (
            <>
              <ul className="flex flex-wrap gap-2 text-[13px] text-tinta" aria-label="Vista previa">
                {resumen(previa).map((t) => <li key={t} className="chip bg-panel-2">{t}</li>)}
              </ul>
              <div>
                <button type="button" onClick={guardar} disabled={guardando} aria-busy={guardando} className="btn-primario min-h-10 px-4 text-[14px] disabled:opacity-60">
                  {guardando ? "Guardando…" : "Guardar distribución"}
                </button>
              </div>
            </>
          )}
          {msg && <p role="alert" className="text-[13px] text-paro-texto">{msg.texto}</p>}
        </div>
      )}
    </div>
  );
}
