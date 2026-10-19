import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { esAdmin, PILARES, etiquetaPilar } from "@/lib/catalogos";
import { Aviso, Encabezado } from "@/components/ui";
import type { Almacen, Modo, Origen, Pilar } from "@/lib/tipos";
import { alternarActivo, crearAlmacen, crearModo, crearOrigen, guardarMetas } from "./acciones";
import { BotonEnviar } from "@/components/BotonEnviar";
import { diagnosticarLlave } from "@/lib/diagnostico";

export const metadata = { title: "Configuración" };

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; bienvenida?: string }> }) {
  const { perfil, tenant } = await exigirRol(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [a, o, m] = await Promise.all([
    supabase.from("almacenes").select("id_almacen, nombre_almacen, activo").order("nombre_almacen"),
    supabase.from("origenes_falla").select("id_origen, nombre, pilares, orden, activo").order("orden").order("nombre"),
    supabase.from("modos_falla").select("id_modo, nombre, pilares, orden, activo").order("orden").order("nombre"),
  ]);
  const almacenes = (a.data ?? []) as Almacen[];
  const origenes = (o.data ?? []) as Origen[];
  const modos = (m.data ?? []) as Modo[];
  const diag = esAdmin(perfil.rol) ? await diagnosticarLlave() : null;

  return (
    <>
      <Encabezado ruta={[{ href: "/", texto: "Pilares" }]} titulo="Configuración" sub="Catálogos compartidos por todos los pilares de tu organización." />
      {sp.bienvenida && (
        <div className="mb-6"><Aviso tono="alerta">Organización creada. Primeros pasos: almacenes, revisa los orígenes de falla y después da de alta equipos en cada pilar.</Aviso></div>
      )}
      {sp.ok && <div className="mb-6"><Aviso tono="ok">{sp.ok}</Aviso></div>}
      {sp.error && <div className="mb-6"><Aviso tono="paro">{sp.error}</Aviso></div>}

      {diag && (
        <section id="conexion" className="caja-panel mb-6 scroll-mt-24 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Conexión para administrar usuarios</h2>
            <span className={`chip ${diag.ok ? "bg-ok-suave text-ok-texto" : "bg-paro-suave text-paro-texto"}`}>{diag.ok ? "Lista" : "Revisar"}</span>
          </div>
          <p className="mt-1 text-[15px] text-suave">Revisa la llave SUPABASE_SERVICE_ROLE_KEY de Vercel sin mostrarla.</p>
          <ul className="mt-4 space-y-1.5 text-[15px]">
            {diag.lineas.map((l, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden="true" className={l.estado === "ok" ? "text-ok-texto" : l.estado === "mal" ? "text-paro-texto" : "text-alerta-texto"}>{l.estado === "ok" ? "✓" : l.estado === "mal" ? "✕" : "!"}</span><span>{l.texto}</span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6">
        <Lista id="almacenes" titulo="Almacenes" sub="CEDIS y sitios donde están los equipos." tabla="almacenes"
          items={almacenes.map((x) => ({ id: x.id_almacen, nombre: x.nombre_almacen, activo: x.activo }))}
          accion={crearAlmacen} placeholder="Ej. CDN1, Tijuana" />
      </div>

      <div className="mt-6 grid gap-6">
        <CatalogoFalla id="modos" titulo="Qué falla: componentes y modos" tabla="modos" accion={crearModo}
          sub="Se pide al cerrar cada orden. Responde qué parte del equipo falló (ruedas, hidráulico, banda…)."
          placeholder="Ej. Horquillas, Variador de frecuencia"
          items={modos.map((x) => ({ id: x.id_modo, nombre: x.nombre, pilares: x.pilares, activo: x.activo }))} />
        <CatalogoFalla id="origenes" titulo="Por qué falla: causas" tabla="origenes" accion={crearOrigen}
          sub="Se pide al cerrar cada orden. Responde por qué falló, para decidir la acción (capacitación, preventivo, rediseño)."
          placeholder="Ej. Sobrecarga, Contaminación"
          items={origenes.map((x) => ({ id: x.id_origen, nombre: x.nombre, pilares: x.pilares, activo: x.activo }))} />
      </div>

      {esAdmin(perfil.rol) && (
        <section id="metas" className="caja-panel mt-6 scroll-mt-24 p-6">
          <h2 className="text-xl font-semibold">Metas y pilares activos</h2>
          <p className="mt-1 text-[15px] text-suave">Las metas definen las insignias de Indicadores (Dentro de meta / Crítico).</p>
          <form action={guardarMetas} className="mt-5 grid gap-5 md:grid-cols-3">
            <label><span className="etiqueta">Meta de MTTR (horas, máximo)</span>
              <input name="meta_mttr_horas" type="number" step="0.1" min="0.1" required defaultValue={tenant.meta_mttr_horas} className="campo" /></label>
            <label><span className="etiqueta">Meta de disponibilidad (%, mínimo)</span>
              <input name="meta_disponibilidad_pct" type="number" step="0.1" min="1" max="100" required defaultValue={tenant.meta_disponibilidad_pct} className="campo" /></label>
            <label><span className="etiqueta">Meta de MTBF (horas, mínimo, opcional)</span>
              <input name="meta_mtbf_horas" type="number" step="0.1" min="0" defaultValue={tenant.meta_mtbf_horas ?? ""} className="campo" /></label>
            <fieldset className="md:col-span-3">
              <legend className="etiqueta">Pilares activos (los demás aparecen como Preparado)</legend>
              <div className="flex flex-wrap gap-2">
                {PILARES.map((p) => (
                  <label key={p.valor} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-papel px-4 text-[15px]">
                    <input type="checkbox" name="pilares_activos" value={p.valor} defaultChecked={tenant.pilares_activos.includes(p.valor)} className="h-4 w-4" /> {p.etiqueta}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="md:col-span-3"><BotonEnviar>Guardar metas</BotonEnviar></div>
          </form>
        </section>
      )}
    </>
  );
}

function Alternar({ tabla, id, activo }: { tabla: string; id: string; activo: boolean }) {
  return (
    <form action={alternarActivo}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "1" : "0"} />
      <BotonEnviar className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold underline-offset-2 hover:underline disabled:opacity-60" pendiente="…">{activo ? "Desactivar" : "Activar"}</BotonEnviar>
    </form>
  );
}

function Lista({ id, titulo, sub, tabla, items, accion, placeholder }: {
  id: string; titulo: string; sub: string; tabla: string;
  items: { id: string; nombre: string; activo: boolean }[]; accion: (f: FormData) => Promise<void>; placeholder: string;
}) {
  return (
    <section id={id} className="caja-panel scroll-mt-24 p-6">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="mt-1 text-[15px] text-suave">{sub}</p>
      <form action={accion} className="mt-5 flex gap-2">
        <label className="sr-only" htmlFor={`nuevo-${id}`}>Nuevo</label>
        <input id={`nuevo-${id}`} name="nombre" required className="campo min-h-11" placeholder={placeholder} />
        <BotonEnviar className="btn-primario min-h-11 shrink-0" pendiente="Agregando…">Agregar</BotonEnviar>
      </form>
      <ul className="mt-5 max-h-80 space-y-1.5 overflow-y-auto">
        {items.length === 0 && <li className="py-4 text-center text-[15px] text-suave">Sin registros todavía.</li>}
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between rounded-xl bg-papel px-4 py-2">
            <span className={i.activo ? "font-medium" : "text-suave line-through"}>{i.nombre}</span>
            <Alternar tabla={tabla} id={i.id} activo={i.activo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CatalogoFalla({ id, titulo, sub, tabla, items, accion, placeholder }: {
  id: string; titulo: string; sub: string; tabla: string; placeholder: string;
  items: { id: string; nombre: string; pilares: Pilar[] | null; activo: boolean }[]; accion: (f: FormData) => Promise<void>;
}) {
  return (
    <section id={id} className="caja-panel scroll-mt-24 p-6">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="mt-1 max-w-2xl text-[15px] text-suave">{sub}</p>
      <form action={accion} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1"><span className="etiqueta">Agregar</span>
          <input name="nombre" required className="campo min-h-11" placeholder={placeholder} /></label>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="etiqueta">Aplica a</legend>
          {PILARES.map((p) => (
            <label key={p.valor} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-papel px-4 text-[15px]">
              <input type="checkbox" name="pilares" value={p.valor} defaultChecked className="h-4 w-4" /> {p.etiqueta}
            </label>
          ))}
        </fieldset>
        <BotonEnviar className="btn-primario min-h-11" pendiente="Agregando…">Agregar</BotonEnviar>
      </form>
      <ul className="mt-6 grid gap-2 md:grid-cols-2">
        {items.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl bg-papel px-4 py-3">
            <div className="min-w-0">
              <p className={x.activo ? "font-medium" : "text-suave line-through"}>{x.nombre}</p>
              <p className="text-[13px] text-suave">{x.pilares ? x.pilares.map(etiquetaPilar).join(", ") : "Todos los pilares"}</p>
            </div>
            <Alternar tabla={tabla} id={x.id} activo={x.activo} />
          </li>
        ))}
      </ul>
    </section>
  );
}
