"use client";

import { useCallback, useMemo } from "react";
import { ImportarTabla, type ResultadoImport } from "@/components/ImportarTabla";
import { leerFecha } from "@/lib/historial";

const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** El programa anual (CABLOMTO-F01) tiene su propio cargador: si suben ese Excel aquí, se avisa. */
async function esProgramaAnual(archivo: File) {
  if (!/\.xlsx$/i.test(archivo.name)) return null;
  if (/cablomto/i.test(archivo.name)) return AVISO_PROGRAMA;
  try {
    const { readSheet } = await import("read-excel-file/browser");
    await readSheet(archivo, "CABLOMTO-F01-I41");
    return AVISO_PROGRAMA;
  } catch {
    return null;
  }
}
const AVISO_PROGRAMA = "Este Excel es el programa anual (CABLOMTO-F01). Súbelo en el recuadro de arriba, “Programa anual de mantenimiento”; aquí no se lee bien.";

export function ImportarPlan({ pilar, planes, importar }: {
  pilar: string;
  /** Nombres de los planes que ya existen (no necesitan "Cada (días)"). */
  planes: string[];
  importar: (pilar: string, filas: Record<string, string>[]) => Promise<ResultadoImport>;
}) {
  const existentes = useMemo(() => new Set(planes.map(clave)), [planes]);
  const validar = useCallback((f: Record<string, string>, _: number, todas: Record<string, string>[]) => {
    if (!f.servicio?.trim()) return "!Sin servicio: el equipo se queda sin plan";
    if (!f.sap?.trim() && !f.serie?.trim() && !f.equipo?.trim()) return "Falta el SAP, la serie o el nombre del equipo";
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
        { clave: "sap", etiqueta: "SAP", alias: ["sap", "serie sap", "no sap", "numero sap"], ejemplo: "102580" },
        { clave: "serie", etiqueta: "Serie", alias: ["no serie", "numero de serie"], ejemplo: "M331200016" },
        { clave: "equipo", etiqueta: "Equipo", alias: ["nombre", "nombre equipo"], ejemplo: "Montacarga HS 236" },
        { clave: "almacen", etiqueta: "Almacén", alias: ["almacen", "cedis", "ubicacion"], ejemplo: "CDN 3" },
        { clave: "servicio", etiqueta: "Servicio", alias: ["plan", "mantenimiento", "servicio preventivo"], ejemplo: "Servicio mensual" },
        { clave: "tipo", etiqueta: "Tipo", alias: ["tipo de plan", "clase"], ejemplo: "Preventivo" },
        { clave: "cada", etiqueta: "Cada (días)", alias: ["cada", "frecuencia", "dias", "cada dias", "frecuencia dias"], ejemplo: "30" },
        { clave: "ultimo", etiqueta: "Último servicio", alias: ["ultimo", "ultimo servicio", "fecha ultimo servicio", "ultima fecha"], ejemplo: "01/10/2026" },
        { clave: "tareas", etiqueta: "Tareas", alias: ["actividades", "checklist"], ejemplo: "Revisar batería; frenos; lubricar cadenas" },
      ]}
      validar={validar}
      revisarArchivo={esProgramaAnual}
      importar={(filas) => importar(pilar, filas)}
    />
  );
}
