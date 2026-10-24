import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar, todasLasPaginas } from "@/lib/datos";
import { puedeAsignar } from "@/lib/catalogos";
import { Encabezado, Seccion, Vacio } from "@/components/ui";
import { ImportarPlan } from "@/components/importar/ImportarPlan";
import { PanelPlanes } from "./PanelPlanes";
import { importarPlan } from "./acciones";
import type { PlanEquipo, PlanMantenimiento } from "@/lib/tipos";

export const metadata = { title: "Planes de mantenimiento" };

const fechaCorta = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";

export default async function Planes({ params }: { params: Promise<{ pilar: string }> }) {
  const { pilar: p } = await params;
  const { perfil, pilar } = await sesionDePilar(p);
  const editar = puedeAsignar(perfil.rol);
  const supabase = await createClient();

  const [{ data: planesData }, { data: asignaciones }, cat] = await Promise.all([
    supabase.from("planes_mantenimiento").select("id_plan, pilar, nombre, cada_dias, tareas, activo").eq("pilar", pilar).order("nombre"),
    todasLasPaginas<PlanEquipo>((d, h) => supabase.from("v_plan_equipos").select("*").eq("pilar", pilar).order("proximo").order("id").range(d, h)),
    catalogosPilar(pilar, { equipos: editar }),
  ]);
  const planes = (planesData ?? []) as PlanMantenimiento[];
  const conPlan = new Set(asignaciones.map((a) => a.id_equipo)).size;
  const vencidos = asignaciones.filter((a) => a.dias_restantes < 0).length;
  const semana = asignaciones.filter((a) => a.dias_restantes >= 0 && a.dias_restantes <= 7).length;
  const asignados: Record<string, string[]> = {};
  for (const a of asignaciones) (asignados[a.id_plan] ??= []).push(a.id_equipo);

  return (
    <>
      <Encabezado titulo="Planes de mantenimiento"
        sub={`${planes.length} plan${planes.length === 1 ? "" : "es"} · ${conPlan} equipos con plan · ${vencidos} vencidos · ${semana} esta semana`}>
        <a href={`/p/${pilar}/planes/excel`} className="btn-sec" download>Descargar Excel</a>
      </Encabezado>

      {editar && <ImportarPlan pilar={pilar} planes={planes.map((x) => x.nombre)} importar={importarPlan} />}

      {editar && (
        <PanelPlanes
          pilar={pilar}
          planes={planes}
          almacenes={cat.almacenes}
          asignados={asignados}
          equipos={cat.equipos.map((e) => ({ id: e.id_equipo, nombre: e.nombre_equipo, sap: e.sap_id, id_almacen: e.id_almacen }))}
        />
      )}

      <Seccion titulo="Próximos servicios" sub="Se calculan solos: último servicio + frecuencia del plan. Los vencidos aparecen primero.">
        {asignaciones.length === 0 ? (
          <Vacio titulo="Aún no hay equipos con plan">
            {editar ? "Descarga el Excel y llénalo, o crea un plan y selecciona sus equipos." : "Un supervisor o coordinador puede cargar los planes."}
          </Vacio>
        ) : (
          <div className="caja-panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-[15px]">
              <thead className="text-left text-sm text-suave">
                <tr>
                  {["Equipo", "Almacén", "Plan", "Último servicio", "Próximo", "Faltan"].map((t, i) => (
                    <th key={t} className={`px-5 pb-2 pt-4 font-medium ${i === 5 ? "text-right" : ""}`}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asignaciones.slice(0, 60).map((a) => (
                  <tr key={a.id} className="odd:bg-papel/60">
                    <td className="px-5 py-3"><p className="font-medium">{a.nombre_equipo}</p>{a.sap_id && <p className="text-sm text-suave">SAP {a.sap_id}</p>}</td>
                    <td className="px-5 py-3 text-suave">{a.nombre_almacen ?? "—"}</td>
                    <td className="px-5 py-3">{a.plan}<p className="text-sm text-suave">Cada {a.cada_dias} días</p></td>
                    <td className="px-5 py-3 tabular-nums">{fechaCorta(a.ultimo_servicio)}</td>
                    <td className="px-5 py-3 tabular-nums">{fechaCorta(a.proximo)}</td>
                    <td className={`px-5 py-3 text-right font-semibold tabular-nums ${a.dias_restantes < 0 ? "text-paro-texto" : a.dias_restantes <= 7 ? "text-alerta-texto" : ""}`}>
                      {a.dias_restantes < 0 ? `Vencido ${-a.dias_restantes} d` : a.dias_restantes === 0 ? "Hoy" : `${a.dias_restantes} d`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {asignaciones.length > 60 && <p className="px-5 py-3 text-sm text-suave">Mostrando 60 de {asignaciones.length}. El Excel trae todos.</p>}
          </div>
        )}
      </Seccion>
    </>
  );
}
