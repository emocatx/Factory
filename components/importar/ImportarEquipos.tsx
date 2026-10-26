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
    if (!f.serie?.trim() && !f.sap?.trim()) return "Falta la serie o el SAP";
    const serie = f.serie?.trim().toLowerCase();
    if (serie && todas.findIndex((x) => x.serie?.trim().toLowerCase() === serie) !== i) return "Serie repetida en la lista";
    if (!conocidos.has(f.almacen.trim().replace(/\s+/g, " ").toLowerCase())) return "!Almacén nuevo: se crea si marcas la casilla de abajo";
    return null;
  }, [conocidos]);
  return (
    <ImportarTabla
      titulo="Carga masiva de equipos"
      ayuda="Pega desde Excel o sube un .xlsx / .csv. Si la serie (o el SAP) ya existe, el equipo se actualiza; así se le agrega el SAP cuando llega."
      nombrePlantilla="plantilla-equipos.csv"
      columnas={[
        { clave: "nombre", etiqueta: "Nombre", requerida: true, alias: ["titulo", "equipo", "nombre equipo", "descripcion", "descripcion real sap", "descripcion sap"], ejemplo: "Montacargas 04" },
        { clave: "sap", etiqueta: "SAP", alias: ["sap", "equipo sap", "no sap", "numero sap", "serie sap"], ejemplo: "102580" },
        { clave: "serie", etiqueta: "Serie", alias: ["no serie", "numero de serie", "num serie", "serie fabricante"], ejemplo: "M331200016" },
        { clave: "propiedad", etiqueta: "Propio/Renta", alias: ["propiedad", "propio renta", "tipo propiedad"], ejemplo: "Propio" },
        { clave: "modelo", etiqueta: "Modelo", ejemplo: "EPT20-35RTS" },
        { clave: "fabricante", etiqueta: "Fabricante", alias: ["marca"], ejemplo: "EP EQUIPMENT" },
        { clave: "proveedor", etiqueta: "Proveedor", ejemplo: "NOBLEMAQ" },
        { clave: "clave", etiqueta: "Clave", alias: ["clave interna", "id", "codigo"], ejemplo: "MC-04" },
        { clave: "almacen", etiqueta: "Almacén", requerida: true, alias: ["almacen", "cedis", "ubicacion", "ubicacion real", "sitio"], ejemplo: almacenes[0] ?? "CDN1" },
      ]}
      validar={validar}
      importar={(filas, crear) => importar(pilar, filas, crear)}
      opcion={{ etiqueta: "Crear los almacenes que no existan", porDefecto: false }}
    />
  );
}
