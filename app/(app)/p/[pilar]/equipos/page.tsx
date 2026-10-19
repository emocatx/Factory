import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar } from "@/lib/datos";
import { esUuid } from "@/lib/filtros";
import { puedeAdministrar } from "@/lib/catalogos";
import { Aviso, ChipEquipo, Encabezado, Vacio } from "@/components/ui";
import type { Equipo } from "@/lib/tipos";
import { cambiarBaja, guardarEquipo, importarEquipos, moverEquipos } from "./acciones";
import { ImportarEquipos } from "@/components/importar/ImportarEquipos";
import { BotonEnviar } from "@/components/BotonEnviar";

export const metadata = { title: "Equipos" };

export default async function Equipos({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ q?: string; editar?: string; ok?: string; error?: string; bajas?: string }>;
}) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  if (!puedeAdministrar(perfil.rol)) redirect(`/p/${pilar}/ordenes`);
  const f = await searchParams;
  const dorsal = pilar === "dorsales";
  const supabase = await createClient();
  const cat = await catalogosPilar(pilar);
  let q = supabase.from("equipos").select("id_equipo, id_almacen, id_linea, sap_id, clave_id, nombre_equipo, tipo_pilar, estatus")
    .eq("tipo_pilar", pilar).order("nombre_equipo");
  if (!f.bajas) q = q.neq("estatus", "baja");
  const { data } = await q;
  let equipos = (data ?? []) as Equipo[];
  const t = f.q?.trim().toLowerCase();
  if (t) equipos = equipos.filter((e) => [e.nombre_equipo, e.sap_id, e.clave_id].some((v) => v?.toLowerCase().includes(t)));
  const editar = esUuid(f.editar) ? equipos.find((e) => e.id_equipo === f.editar) ?? null : null;
  const alm = new Map(cat.almacenes.map((a) => [a.id_almacen, a.nombre_almacen]));
  const lin = new Map(cat.lineas.map((l) => [l.id_linea, l.nombre_linea]));

  return (
    <>
      <Encabezado

        titulo="Equipos"
        sub="Datos maestros de los equipos de este pilar: alta, edición individual y cambio masivo."
      />
      {f.ok && <div className="mb-6"><Aviso tono="ok">{f.ok}</Aviso></div>}
      {f.error && <div className="mb-6"><Aviso tono="paro">{f.error}</Aviso></div>}

      <ImportarEquipos pilar={pilar} almacenes={cat.almacenes.map((a) => a.nombre_almacen)} importar={importarEquipos} />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="etiqueta">Buscar por nombre o serie SAP</span>
              <input name="q" defaultValue={f.q} className="campo min-h-11" placeholder={dorsal ? "Ej. MM748 o Transportador" : "Ej. 100200 o Montacargas"} />
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 text-[15px]">
              <input type="checkbox" name="bajas" value="1" defaultChecked={!!f.bajas} className="h-5 w-5" /> Incluir bajas
            </label>
            <button className="btn-primario min-h-11">Buscar</button>
          </form>

          {equipos.length === 0 ? (
            <Vacio titulo={t ? "Sin coincidencias" : "Aún no hay equipos en este pilar"}>
              {t ? "Prueba con otra serie o nombre." : "Da de alta el primero con el formulario."}
            </Vacio>
          ) : (
            <form action={moverEquipos} className="caja-panel overflow-hidden">
              <input type="hidden" name="pilar" value={pilar} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[15px]">
                  <thead className="text-left text-sm text-suave">
                    <tr>
                      <th className="w-10 px-5 pb-2 pt-4"><span className="sr-only">Seleccionar</span></th>
                      <th className="px-3 pb-2 pt-4 font-medium">Equipo</th>
                      <th className="px-3 pb-2 pt-4 font-medium">{dorsal ? "Línea · almacén" : "Almacén"}</th>
                      <th className="px-3 pb-2 pt-4 font-medium">Estatus</th>
                      <th className="px-5 pb-2 pt-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {equipos.map((e) => (
                      <tr key={e.id_equipo} className={`odd:bg-papel/60 ${e.estatus === "baja" ? "text-suave" : ""}`}>
                        <td className="px-5 py-3"><input type="checkbox" name="sel" value={e.id_equipo} className="h-5 w-5" aria-label={`Seleccionar ${e.nombre_equipo}`} /></td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{e.nombre_equipo}</p>
                          {(e.sap_id || e.clave_id) && <p className="font-mono text-[13px] text-suave">{[e.sap_id && `SAP ${e.sap_id}`, e.clave_id].filter(Boolean).join(" · ")}</p>}
                        </td>
                        <td className="px-3 py-3">{[dorsal ? lin.get(e.id_linea ?? "") : null, alm.get(e.id_almacen)].filter(Boolean).join(" · ")}</td>
                        <td className="px-3 py-3"><ChipEquipo e={e.estatus} /></td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <a href={`?editar=${e.id_equipo}${f.q ? `&q=${encodeURIComponent(f.q)}` : ""}`} className="font-semibold underline">Editar</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <fieldset className="flex flex-wrap items-end gap-3 bg-papel p-5">
                <legend className="sr-only">Cambio masivo</legend>
                <p className="w-full text-[15px] font-semibold">Cambio masivo a los seleccionados</p>
                <label>
                  <span className="etiqueta">Mover a almacén</span>
                  <select name="destino_almacen" className="campo min-h-11 w-auto pr-10" defaultValue="">
                    <option value="">Sin cambio</option>
                    {cat.almacenes.map((a) => <option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}
                  </select>
                </label>
                {dorsal && (
                  <label>
                    <span className="etiqueta">Mover a línea</span>
                    <select name="destino_linea" className="campo min-h-11 w-auto pr-10" defaultValue="">
                      <option value="">Sin cambio</option>
                      {cat.lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre_linea}</option>)}
                    </select>
                  </label>
                )}
                <BotonEnviar className="btn-sec min-h-11" pendiente="Aplicando…">Aplicar cambio</BotonEnviar>
              </fieldset>
            </form>
          )}
        </div>

        <aside className="caja-panel p-6 lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold">{editar ? "Modificar equipo" : "Alta de equipo"}</h2>
          <form action={guardarEquipo} className="mt-5 space-y-4">
            <input type="hidden" name="pilar" value={pilar} />
            {editar && <input type="hidden" name="id_equipo" value={editar.id_equipo} />}
            <label className="block"><span className="etiqueta">Nombre</span>
              <input name="nombre" required defaultValue={editar?.nombre_equipo} className="campo" placeholder={dorsal ? "Transportador CDN5 365" : "Montacargas 04"} /></label>
            <label className="block"><span className="etiqueta">Serie SAP</span>
              <input name="sap_id" defaultValue={editar?.sap_id ?? ""} className="campo font-mono" /></label>
            <label className="block"><span className="etiqueta">Clave interna (opcional)</span>
              <input name="clave_id" defaultValue={editar?.clave_id ?? ""} className="campo font-mono" /></label>
            <label className="block"><span className="etiqueta">Almacén</span>
              <select name="id_almacen" required defaultValue={editar?.id_almacen ?? ""} className="campo">
                <option value="" disabled>Selecciona almacén</option>
                {cat.almacenes.map((a) => <option key={a.id_almacen} value={a.id_almacen}>{a.nombre_almacen}</option>)}
              </select></label>
            {dorsal && (
              <label className="block"><span className="etiqueta">Línea</span>
                <select name="id_linea" defaultValue={editar?.id_linea ?? ""} className="campo">
                  <option value="">Sin línea</option>
                  {cat.lineas.map((l) => <option key={l.id_linea} value={l.id_linea}>{l.nombre_linea}</option>)}
                </select></label>
            )}
            {cat.almacenes.length === 0 && <Aviso tono="alerta">Primero da de alta almacenes en Configuración.</Aviso>}
            <BotonEnviar className="btn-primario w-full">{editar ? "Guardar cambios" : "Dar de alta"}</BotonEnviar>
          </form>
          {editar && (
            <div className="mt-4 flex gap-2">
              <a href="?" className="btn-sec flex-1">Nuevo equipo</a>
              <form action={cambiarBaja} className="flex-1">
                <input type="hidden" name="pilar" value={pilar} />
                <input type="hidden" name="id_equipo" value={editar.id_equipo} />
                <input type="hidden" name="reactivar" value={editar.estatus === "baja" ? "1" : "0"} />
                <BotonEnviar className={`${editar.estatus === "baja" ? "btn-sec" : "btn-peligro"} w-full`}>{editar.estatus === "baja" ? "Reactivar" : "Dar de baja"}</BotonEnviar>
              </form>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
