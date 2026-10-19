"use client";

import { useCallback, useMemo } from "react";
import { ImportarTabla, type ResultadoImport } from "@/components/ImportarTabla";

export function ImportarEquipos({ pilar, almacenes, importar }: {
  pilar: string;
  almacenes: string[];
  importar: (pilar: string, filas: Record<string, string>[], crearAlmacenes: boolean) => Promise<ResultadoImport>;
}) {
  const conocidos = useMemo(() => new Set(almacenes.map((a) => a.trim().replace(/\s+/g, " ").toLowerCase())), [almacenes]);
  const validar = useCallback((f: Record<string, string>, i: number, todas: Record<string, string>[]) => {
    if (!f.nombre?.trim()) return "Falta el nombre";
    if (!f.almacen?.trim()) return "Falta el almacén";
    const sap = f.sap?.trim().toLowerCase();
    if (sap && todas.findIndex((x) => x.sap?.trim().toLowerCase() === sap) !== i) return "Serie SAP repetida en la lista";
    if (!conocidos.has(f.almacen.trim().replace(/\s+/g, " ").toLowerCase())) return "!Almacén nuevo: se crea si marcas la casilla de abajo";
    return null;
  }, [conocidos]);
  return (
    <ImportarTabla
      titulo="Carga masiva de equipos"
      ayuda="Pega desde Excel o sube un .xlsx / .csv. Las series SAP que ya existen se omiten."
      nombrePlantilla="plantilla-equipos.csv"
      columnas={[
        { clave: "nombre", etiqueta: "Nombre", requerida: true, alias: ["equipo", "nombre equipo", "descripcion"], ejemplo: "Montacargas 04" },
        { clave: "sap", etiqueta: "Serie SAP", alias: ["sap", "serie", "equipo sap", "no sap", "numero sap"], ejemplo: "100204" },
        { clave: "clave", etiqueta: "Clave", alias: ["clave interna", "id", "codigo"], ejemplo: "MC-04" },
        { clave: "almacen", etiqueta: "Almacén", requerida: true, alias: ["almacen", "cedis", "ubicacion", "sitio"], ejemplo: almacenes[0] ?? "CDN1" },
      ]}
      validar={validar}
      importar={(filas, crear) => importar(pilar, filas, crear)}
      opcion={{ etiqueta: "Crear los almacenes que no existan", porDefecto: false }}
    />
  );
}
