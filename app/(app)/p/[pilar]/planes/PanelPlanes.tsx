"use client";

import { useMemo, useState, useTransition } from "react";
import { Desplegable } from "@/components/Desplegable";
import { IcoAlmacen } from "@/components/Iconos";
import { Aviso } from "@/components/ui";
import type { Almacen, PlanMantenimiento } from "@/lib/tipos";
import { asignarPlan, crearPlan, quitarPlan } from "./acciones";

type EquipoLigero = { id: string; nombre: string; sap: string | null; id_almacen: string };
type Res = { ok: boolean; mensaje: string } | null;

/** Crear un plan y asignarlo seleccionando equipos (filtrables por almacén y búsqueda). */
export function PanelPlanes({ pilar, planes, equipos, almacenes, asignados }: {
  pilar: string;
  planes: PlanMantenimiento[];
  equipos: EquipoLigero[];
  almacenes: Almacen[];
  /** id_plan → ids de equipos que ya lo tienen. */
  asignados: Record<string, string[]>;
}) {
  const [pend, start] = useTransition();
  const [res, setRes] = useState<Res>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", cada: "30", tareas: "" });
  const [elegido, setPlan] = useState("");
  // Si aún no se elige (o se acaba de crear el primero), se usa el primer plan.
  const plan = planes.some((p) => p.id_plan === elegido) ? elegido : (planes[0]?.id_plan ?? "");
  const [almacen, setAlmacen] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ultimo, setUltimo] = useState("");

  const yaTienen = useMemo(() => new Set(asignados[plan] ?? []), [asignados, plan]);
  const nombreAlmacen = useMemo(() => new Map(almacenes.map((a) => [a.id_almacen, a.nombre_almacen])), [almacenes]);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return equipos.filter((e) => (!almacen || e.id_almacen === almacen) && (!t || e.nombre.toLowerCase().includes(t) || e.sap?.toLowerCase().includes(t)));
  }, [equipos, almacen, q]);
  const todosVisibles = visibles.length > 0 && visibles.every((e) => sel.has(e.id));

  function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>, alTerminar?: () => void) {
    setRes(null);
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) alTerminar?.();
    });
  }

  function alternarVisibles() {
    setSel((s) => {
      const n = new Set(s);
      visibles.forEach((e) => (todosVisibles ? n.delete(e.id) : n.add(e.id)));
      return n;
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form className="caja-panel space-y-4 p-6" onSubmit={(e) => {
        e.preventDefault();
        correr(() => crearPlan(pilar, { nombre: nuevo.nombre, cada_dias: Number(nuevo.cada), tareas: nuevo.tareas }), () => setNuevo({ nombre: "", cada: "30", tareas: "" }));
      }}>
        <p className="text-lg font-semibold">Nuevo plan</p>
        <label className="block">
          <span className="etiqueta">Servicio</span>
          <input className="campo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Servicio mensual montacargas" required />
        </label>
        <label className="block">
          <span className="etiqueta">Cada cuántos días</span>
          <input className="campo" type="number" min={1} max={3650} value={nuevo.cada} onChange={(e) => setNuevo({ ...nuevo, cada: e.target.value })} required />
        </label>
        <label className="block">
          <span className="etiqueta">Tareas (opcional)</span>
          <textarea className="campo" rows={4} value={nuevo.tareas} onChange={(e) => setNuevo({ ...nuevo, tareas: e.target.value })} placeholder={"Revisar batería\nFrenos\nLubricar cadenas"} />
        </label>
        <button className="btn-motivo w-full" disabled={pend}>{pend ? "Guardando…" : "Crear plan"}</button>
      </form>

      <section className="caja-panel p-6">
        <p className="text-lg font-semibold">Asignar a equipos</p>
        {res && <div className="mt-3"><Aviso tono={res.ok ? "ok" : "paro"}>{res.mensaje}</Aviso></div>}
        {planes.length === 0 ? (
          <p className="mt-3 text-[15px] text-suave">Crea un plan o cárgalo desde Excel para poder asignarlo.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <label htmlFor="asignar-plan" className="etiqueta">Plan</label>
                <Desplegable id="asignar-plan" value={plan} onChange={(v) => setPlan(v)}
                  opciones={planes.map((p) => ({ valor: p.id_plan, etiqueta: p.nombre, detalle: `Cada ${p.cada_dias} días` }))} />
              </div>
              <div>
                <label htmlFor="asignar-almacen" className="etiqueta">Almacén</label>
                <Desplegable id="asignar-almacen" value={almacen} onChange={setAlmacen} icono={<IcoAlmacen />}
                  opciones={[{ valor: "", etiqueta: "Todos los almacenes" }, ...almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))]} />
              </div>
              <label>
                <span className="etiqueta">Buscar</span>
                <input className="campo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o serie SAP" />
              </label>
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--radius-control)] border border-papel">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 bg-papel px-4 text-[14px] font-medium">
                <input type="checkbox" className="h-5 w-5" checked={todosVisibles} onChange={alternarVisibles} />
                Seleccionar los {visibles.length} mostrados
                <span className="ml-auto text-suave">{sel.size} seleccionado{sel.size === 1 ? "" : "s"}</span>
              </label>
              <ul className="max-h-80 overflow-y-auto">
                {visibles.map((e) => (
                  <li key={e.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-papel px-4 py-2 text-[15px] hover:bg-papel/60">
                      <input type="checkbox" className="h-5 w-5" checked={sel.has(e.id)}
                        onChange={() => setSel((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
                      <span className="min-w-0 flex-1 truncate font-medium">{e.nombre}</span>
                      <span className="hidden text-[13px] text-suave sm:inline">{[e.sap && `SAP ${e.sap}`, nombreAlmacen.get(e.id_almacen)].filter(Boolean).join(" · ")}</span>
                      {yaTienen.has(e.id) && <span className="chip bg-ok-suave text-ok-texto">Ya lo tiene</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label>
                <span className="etiqueta">Último servicio (opcional)</span>
                <input type="date" className="campo min-h-11" value={ultimo} onChange={(e) => setUltimo(e.target.value)} />
              </label>
              <button type="button" className="btn-motivo" disabled={pend || !sel.size}
                onClick={() => correr(() => asignarPlan(pilar, plan, [...sel], ultimo), () => setSel(new Set()))}>
                Asignar a {sel.size}
              </button>
              <button type="button" className="btn-peligro" disabled={pend || ![...sel].some((id) => yaTienen.has(id))}
                onClick={() => correr(() => quitarPlan(pilar, plan, [...sel].filter((id) => yaTienen.has(id))), () => setSel(new Set()))}>
                Quitar plan
              </button>
            </div>
            <p className="mt-2 text-[13px] text-suave">Sin fecha, el próximo servicio se cuenta desde hoy. El próximo se recalcula solo con cada último servicio.</p>
          </>
        )}
      </section>
    </div>
  );
}
