"use client";

import { useCallback } from "react";
import { ImportarTabla, type ResultadoImport } from "@/components/ImportarTabla";

export function ImportarAlmacenes({ importar }: { importar: (filas: Record<string, string>[]) => Promise<ResultadoImport> }) {
  const validar = useCallback((f: Record<string, string>, i: number, todas: Record<string, string>[]) => {
    const n = f.nombre?.trim().toLowerCase();
    if (!n) return "Falta el nombre";
    if (todas.findIndex((x) => x.nombre?.trim().toLowerCase() === n) !== i) return "Repetido en la lista";
    return null;
  }, []);
  return (
    <ImportarTabla
      titulo="Carga masiva de almacenes"
      ayuda="Pega una columna con los nombres o sube un archivo. Los que ya existen se omiten."
      nombrePlantilla="plantilla-almacenes.csv"
      columnas={[{ clave: "nombre", etiqueta: "Almacén", requerida: true, alias: ["nombre", "almacen", "cedis", "nombre almacen"], ejemplo: "CDN4" }]}
      validar={validar}
      importar={(filas) => importar(filas)}
    />
  );
}
