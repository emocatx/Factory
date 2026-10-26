import { createClient } from "@/lib/supabase/server";
import { sesionDePilar } from "@/lib/sesion";
import { catalogosPilar, tecnicosPilar } from "@/lib/datos";
import { esUuid } from "@/lib/filtros";
import { ESTADOS, puedeAsignar } from "@/lib/catalogos";
import { BarraFiltros } from "@/components/BarraFiltros";
import { PanelOrdenes } from "./PanelOrdenes";
import type { EstatusOrden, OrdenDetalle } from "@/lib/tipos";

export const metadata = { title: "Órdenes" };

export default async function OrdenesAbiertas({
  params,
  searchParams,
}: {
  params: Promise<{ pilar: string }>;
  searchParams: Promise<{ q?: string; linea?: string; estado?: string; orden?: string }>;
}) {
  const { pilar: p } = await params;
  const { perfil, tenant, pilar } = await sesionDePilar(p);
  const f = await searchParams;

  const supabase = await createClient();
  let q = supabase
    .from("v_ordenes_detalle")
    .select("*")
    .eq("pilar", pilar)
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"])
    .order("prioridad", { ascending: true })
    .order("fecha_ingreso", { ascending: true })
    .limit(300);
  if (esUuid(f.linea)) q = q.eq("id_linea", f.linea);
  if (f.estado && f.estado in ESTADOS) q = q.eq("estatus_orden", f.estado as EstatusOrden);
  const [{ data }, cat, tecnicos] = await Promise.all([q, catalogosPilar(pilar, { equipos: pilar === "dorsales" }), puedeAsignar(perfil.rol) ? tecnicosPilar(pilar) : []]);

  let ordenes = (data ?? []) as OrdenDetalle[];
  // prioridad: alta primero (el enum ordena baja<media<alta, así que invertimos aquí)
  const peso = { alta: 0, media: 1, baja: 2 } as const;
  ordenes = ordenes.sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || a.fecha_ingreso.localeCompare(b.fecha_ingreso));
  const t = f.q?.trim().toLowerCase();
  if (t) {
    ordenes = ordenes.filter((o) =>
      [o.folio_ticket, o.nombre_linea, o.nombre_equipo, o.sap_id, o.serie, o.solicitante_nombre, o.nombre_almacen].some((v) => v?.toLowerCase().includes(t)),
    );
  }

  return (
    <>
      <BarraFiltros
        resumen={`${ordenes.length} ${ordenes.length === 1 ? "orden abierta" : "órdenes abiertas"}`}
        lineas={pilar === "dorsales" ? cat.lineas : undefined}
        valores={{ q: f.q, linea: f.linea, estado: f.estado }}
        mostrarPeriodo={false}
        mostrarBusqueda
        estados={[{ v: "pendiente", t: "Pendiente" }, { v: "asignada", t: "Asignada" }, { v: "en_proceso", t: "En proceso" }]}
      />
      <PanelOrdenes
        pilar={pilar}
        ordenes={ordenes}
        seleccion={esUuid(f.orden) ? f.orden : null}
        rol={perfil.rol}
        miId={perfil.id}
        tz={tenant.zona_horaria}
        tecnicos={tecnicos.map((x) => ({ id: x.id, nombre: x.nombre }))}
        origenes={cat.origenes}
        modos={cat.modos}
        almacenes={cat.almacenes}
        equipos={cat.equipos}
      />
    </>
  );
}
