import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar, todasLasPaginas } from "@/lib/datos";
import { esUuid } from "@/lib/filtros";
import { puedeAdministrar } from "@/lib/catalogos";
import { Aviso, ChipEquipo, Encabezado, Vacio } from "@/components/ui";
import type { Equipo } from "@/lib/tipos";
import { cambiarBaja, guardarEquipo, importarEquipos, importarHistorial, moverEquipos } from "./acciones";
import { ImportarHistorial } from "@/components/importar/ImportarHistorial";
import { ImportarEquipos } from "@/components/importar/ImportarEquipos";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Desplegable } from "@/components/Desplegable";
import { IcoAlmacen } from "@/components/Iconos";
import { leerPropiedad, PROPIEDADES } from "@/lib/equipos";

export const metadata = { title: "Equipos" };

export default async function Equipos({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ q?: string; editar?: string; ok?: string; error?: string; bajas?: string; propiedad?: string }>;
}) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  if (!puedeAdministrar(perfil.rol)) redirect(`/p/${pilar}/ordenes`);
  const f = await searchParams;
  const dorsal = pilar === "dorsales";
  const propiedad = leerPropiedad(f.propiedad);
  const supabase = await createClient();
  const cat = await catalogosPilar(pilar);
  const { data } = await todasLasPaginas<Equipo>((desde, hasta) => {
    let q = supabase.from("equipos")
      .select("id_equipo, id_almacen, id_linea, sap_id, serie, clave_id, nombre_equipo, tipo_pilar, estatus, propiedad, modelo, fabricante, proveedor")
      .eq("tipo_pilar", pilar);
    if (!f.bajas) q = q.neq("estatus", "baja");
    if (propiedad) q = q.eq("propiedad", propiedad);
    return q.order("nombre_equipo").order("id_equipo").range(desde, hasta);
  });
  let equipos = (data ?? []) as Equipo[];
  const t = f.q?.trim().toLowerCase();
  if (t) equipos = equipos.filter((e) => [e.nombre_equipo, e.sap_id, e.serie, e.clave_id, e.modelo].some((v) => v?.toLowerCase().includes(t)));
  const editar = esUuid(f.editar) ? equipos.find((e) => e.id_equipo === f.editar) ?? null : null;
  const alm = new Map(cat.almacenes.map((a) => [a.id_almacen, a.nombre_almacen]));
  const lin = new Map(cat.lineas.map((l) => [l.id_linea, l.nombre_linea]));
  // Conteos de lo que se está viendo (respetan búsqueda y filtros).
  const conteos = [
    { etiqueta: equipos.length === 1 ? "equipo" : "equipos", valor: equipos.length, fuerte: true },
    ...PROPIEDADES.map((x) => ({ etiqueta: x.etiqueta.toLowerCase(), valor: equipos.filter((e) => e.propiedad === x.valor).length, fuerte: false })),
    { etiqueta: "sin SAP", valor: equipos.filter((e) => !e.sap_id).length, fuerte: false },
    ...(f.bajas ? [{ etiqueta: "de baja", valor: equipos.filter((e) => e.estatus === "baja").length, fuerte: false }] : []),
  ].filter((c) => c.fuerte || c.valor > 0);

  return (
    <>
      <Encabezado

        titulo="Equipos"
        sub="Datos maestros de los equipos de este pilar: alta, edición individual y cambio masivo."
      />
      {f.ok && <div className="mb-6"><Aviso tono="ok">{f.ok}</Aviso></div>}
      {f.error && <div className="mb-6"><Aviso tono="paro">{f.error}</Aviso></div>}

      <ImportarEquipos pilar={pilar} almacenes={cat.almacenes.map((a) => a.nombre_almacen)} importar={importarEquipos} />
      <ImportarHistorial
        pilar={pilar}
        equipos={cat.equipos.map((e) => ({ id: e.id_equipo, sap: e.sap_id, serie: e.serie, clave: e.clave_id, nombre: e.nombre_equipo, id_almacen: e.id_almacen }))}
        almacenes={cat.almacenes.map((a) => ({ id: a.id_almacen, nombre: a.nombre_almacen }))}
        origenes={cat.origenes.map((o) => ({ id: o.id_origen, nombre: o.nombre }))}
        modos={cat.modos.map((m) => ({ id: m.id_modo, nombre: m.nombre }))}
        importar={importarHistorial}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="etiqueta">Buscar por nombre, SAP, serie o modelo</span>
              <input name="q" defaultValue={f.q} className="campo min-h-11" placeholder={dorsal ? "Ej. MM748 o Transportador" : "Ej. 102580, M331200016 o Montacargas"} />
            </label>
            <div>
              <label htmlFor="filtro-propiedad" className="etiqueta">Propiedad</label>
              <Desplegable id="filtro-propiedad" name="propiedad" defaultValue={propiedad ?? ""} compacto
                opciones={[{ valor: "", etiqueta: "Todos" }, ...PROPIEDADES]} />
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 text-[15px]">
              <input type="checkbox" name="bajas" value="1" defaultChecked={!!f.bajas} className="h-5 w-5" /> Incluir bajas
            </label>
            <button className="btn-primario min-h-11">Buscar</button>
          </form>

          <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-suave" aria-live="polite">
            {conteos.map((c) => (
              <span key={c.etiqueta}>
                <span className={`tabular-nums ${c.fuerte ? "text-[17px] font-semibold text-tinta" : "font-semibold text-tinta"}`}>{c.valor.toLocaleString("es-MX")}</span> {c.etiqueta}
              </span>
            ))}
          </p>

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
                          <p className="font-medium">
                            {e.nombre_equipo}
                            {e.propiedad !== "propio" && <span className="chip ml-2 bg-panel-2 align-middle text-[12px] text-tinta">{e.propiedad === "renta" ? "Renta" : "Leasing"}</span>}
                          </p>
                          <p className="text-[13px] text-suave">
                            {e.sap_id ? <span className="font-mono">SAP {e.sap_id}</span> : <span className="chip bg-alerta-suave text-[12px] text-alerta-texto">Sin SAP</span>}
                            {[e.serie && `Serie ${e.serie}`, e.modelo, e.clave_id].filter(Boolean).map((v) => <span key={v} className="font-mono"> · {v}</span>)}
                          </p>
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
                <div>
                  <label htmlFor="destino-almacen" className="etiqueta">Mover a almacén</label>
                  <Desplegable id="destino-almacen" name="destino_almacen" defaultValue="" compacto icono={<IcoAlmacen />}
                    opciones={[{ valor: "", etiqueta: "Sin cambio" }, ...cat.almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))]} />
                </div>
                {dorsal && (
                  <div>
                    <label htmlFor="destino-linea" className="etiqueta">Mover a línea</label>
                    <Desplegable id="destino-linea" name="destino_linea" defaultValue="" compacto
                      opciones={[{ valor: "", etiqueta: "Sin cambio" }, ...cat.lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))]} />
                  </div>
                )}
                <BotonEnviar className="btn-sec min-h-11" pendiente="Aplicando…">Aplicar cambio</BotonEnviar>
              </fieldset>
            </form>
          )}
        </div>

        <aside className="caja-panel p-5 lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold">{editar ? "Modificar equipo" : "Alta de equipo"}</h2>
          <form key={editar?.id_equipo ?? "nuevo"} action={guardarEquipo} className="mt-5 space-y-4">
            <input type="hidden" name="pilar" value={pilar} />
            {editar && <input type="hidden" name="id_equipo" value={editar.id_equipo} />}
            <label className="block"><span className="etiqueta">Nombre</span>
              <input name="nombre" required defaultValue={editar?.nombre_equipo} className="campo" placeholder={dorsal ? "Transportador CDN5 365" : "Montacargas 04"} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta">SAP</span>
                <input name="sap_id" defaultValue={editar?.sap_id ?? ""} className="campo font-mono" placeholder="Pendiente" /></label>
              <label className="block"><span className="etiqueta">Serie</span>
                <input name="serie" defaultValue={editar?.serie ?? ""} className="campo font-mono" /></label>
            </div>
            <fieldset>
              <legend className="etiqueta">Propiedad</legend>
              <div className="flex gap-2">
                {PROPIEDADES.map((x) => (
                  <label key={x.valor} className="btn min-h-10 flex-1 cursor-pointer px-2 text-[14px] has-[:checked]:bg-tinta has-[:checked]:text-sobre-tinta bg-papel hover:bg-panel-2">
                    <input type="radio" name="propiedad" value={x.valor} className="sr-only" defaultChecked={(editar?.propiedad ?? "propio") === x.valor} />
                    {x.etiqueta}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block"><span className="etiqueta">Modelo</span>
              <input name="modelo" defaultValue={editar?.modelo ?? ""} className="campo" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="etiqueta">Fabricante</span>
                <input name="fabricante" defaultValue={editar?.fabricante ?? ""} className="campo" /></label>
              <label className="block"><span className="etiqueta">Proveedor</span>
                <input name="proveedor" defaultValue={editar?.proveedor ?? ""} className="campo" /></label>
            </div>
            <label className="block"><span className="etiqueta">Clave interna (opcional)</span>
              <input name="clave_id" defaultValue={editar?.clave_id ?? ""} className="campo font-mono" /></label>
            <div><label htmlFor="equipo-almacen" className="etiqueta">Almacén</label>
              <Desplegable key={`alm-${editar?.id_equipo ?? "nuevo"}`} id="equipo-almacen" name="id_almacen" required defaultValue={editar?.id_almacen ?? ""}
                placeholder="Selecciona almacén" icono={<IcoAlmacen />}
                opciones={cat.almacenes.map((a) => ({ valor: a.id_almacen, etiqueta: a.nombre_almacen }))} /></div>
            {dorsal && (
              <div><label htmlFor="equipo-linea" className="etiqueta">Línea</label>
                <Desplegable key={`lin-${editar?.id_equipo ?? "nuevo"}`} id="equipo-linea" name="id_linea" defaultValue={editar?.id_linea ?? ""}
                  opciones={[{ valor: "", etiqueta: "Sin línea" }, ...cat.lineas.map((l) => ({ valor: l.id_linea, etiqueta: l.nombre_linea }))]} /></div>
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
