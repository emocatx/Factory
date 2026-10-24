"use client";

import { useCallback, useMemo } from "react";
import { ImportarTabla, type ResultadoImport } from "@/components/ImportarTabla";
import { leerFecha } from "@/lib/historial";

const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function ImportarPlan({ pilar, planes, importar }: {
  pilar: string;
  /** Nombres de los planes que ya existen (no necesitan "Cada (días)"). */
  planes: string[];
  importar: (pilar: string, filas: Record<string, string>[]) => Promise<ResultadoImport>;
}) {
  const existentes = useMemo(() => new Set(planes.map(clave)), [planes]);
  const validar = useCallback((f: Record<string, string>, _: number, todas: Record<string, string>[]) => {
    if (!f.servicio?.trim()) return "!Sin servicio: el equipo se queda sin plan";
    if (!f.sap?.trim() && !f.equipo?.trim()) return "Falta la serie SAP o el nombre del equipo";
    if (f.ultimo?.trim() && !leerFecha(f.ultimo, "dmy")) return "Fecha de último servicio no válida (usa dd/mm/aaaa)";
    // Un plan nuevo basta con que una de sus filas traiga la frecuencia.
    const k = clave(f.servicio);
    const conDias = (x: Record<string, string>) => clave(x.servicio ?? "") === k && Number(x.cada?.replace(/[^\d]/g, "")) >= 1;
    const proveedor = (x: Record<string, string>) => clave(x.servicio ?? "") === k && /proveedor/i.test(x.tipo ?? "");
    if (!existentes.has(k) && !todas.some(conDias) && !todas.some(proveedor)) return "Plan nuevo: falta Cada (días)";
    return null;
  }, [existentes]);
  return (
    <ImportarTabla
      titulo="Cargar plan desde Excel"
      ayuda="Descarga el Excel, llena Servicio, Tipo (Preventivo, Inspección o Proveedor), Cada (días), Último servicio y Tareas, y súbelo o pega las celdas."
      nombrePlantilla={`plantilla-plan-${pilar}.csv`}
      columnas={[
        { clave: "sap", etiqueta: "Serie SAP", alias: ["sap", "serie", "no sap", "numero sap"], ejemplo: "100204" },
        { clave: "equipo", etiqueta: "Equipo", alias: ["nombre", "nombre equipo"], ejemplo: "Montacarga HS 236" },
        { clave: "almacen", etiqueta: "Almacén", alias: ["almacen", "cedis", "ubicacion"], ejemplo: "CDN 3" },
        { clave: "servicio", etiqueta: "Servicio", alias: ["plan", "mantenimiento", "servicio preventivo"], ejemplo: "Servicio mensual" },
        { clave: "tipo", etiqueta: "Tipo", alias: ["tipo de plan", "clase"], ejemplo: "Preventivo" },
        { clave: "cada", etiqueta: "Cada (días)", alias: ["cada", "frecuencia", "dias", "cada dias", "frecuencia dias"], ejemplo: "30" },
        { clave: "ultimo", etiqueta: "Último servicio", alias: ["ultimo", "ultimo servicio", "fecha ultimo servicio", "ultima fecha"], ejemplo: "01/10/2026" },
        { clave: "tareas", etiqueta: "Tareas", alias: ["actividades", "checklist"], ejemplo: "Revisar batería; frenos; lubricar cadenas" },
      ]}
      validar={validar}
      importar={(filas) => importar(pilar, filas)}
    />
  );
}
