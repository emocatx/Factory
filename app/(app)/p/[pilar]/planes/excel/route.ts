import { sesionDePilar } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { todasLasPaginas } from "@/lib/datos";
import { etiquetaTipo } from "@/lib/planes";
import type { PlanEquipo } from "@/lib/tipos";

/**
 * Excel del plan (CSV que Excel abre directo): todos los equipos del pilar, una fila por equipo y
 * servicio; los que no tienen plan salen con las columnas del plan vacías para llenarlas y subirlo.
 */
export async function GET(_: Request, { params }: { params: Promise<{ pilar: string }> }) {
  const { pilar } = await sesionDePilar((await params).pilar);
  const supabase = await createClient();
  const [{ data: equipos }, { data: asignaciones }, { data: planes }] = await Promise.all([
    todasLasPaginas<{ id_equipo: string; sap_id: string | null; nombre_equipo: string; almacenes: { nombre_almacen: string } | null }>((d, h) =>
      supabase.from("equipos").select("id_equipo, sap_id, nombre_equipo, almacenes(nombre_almacen)").eq("tipo_pilar", pilar).neq("estatus", "baja")
        .order("nombre_equipo").order("id_equipo").range(d, h)),
    todasLasPaginas<PlanEquipo>((d, h) => supabase.from("v_plan_equipos").select("*").eq("pilar", pilar).order("plan").range(d, h)),
    supabase.from("planes_mantenimiento").select("id_plan, tareas").eq("pilar", pilar),
  ]);
  const tareas = new Map((planes ?? []).map((p) => [p.id_plan as string, (p.tareas as string | null) ?? ""]));
  const porEquipo = new Map<string, PlanEquipo[]>();
  for (const a of asignaciones) porEquipo.set(a.id_equipo, [...(porEquipo.get(a.id_equipo) ?? []), a]);
  const ddmmaaaa = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
  const celda = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

  const filas = [["Serie SAP", "Equipo", "Almacén", "Servicio", "Tipo", "Cada (días)", "Último servicio", "Tareas", "Próximo (calculado)"]];
  for (const e of equipos) {
    const base = [e.sap_id ?? "", e.nombre_equipo, e.almacenes?.nombre_almacen ?? ""];
    const suyas = porEquipo.get(e.id_equipo) ?? [];
    if (!suyas.length) filas.push([...base, "", "", "", "", "", ""]);
    for (const a of suyas) filas.push([...base, a.plan, etiquetaTipo(a.tipo), String(a.cada_dias ?? ""), ddmmaaaa(a.ultimo_servicio), tareas.get(a.id_plan) ?? "", ddmmaaaa(a.proximo)]);
  }
  const csv = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="plan-mantenimiento-${pilar}.csv"`,
    },
  });
}
