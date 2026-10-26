import type { Propiedad } from "./tipos";

/** Referencias visibles de un equipo: primero el SAP (si ya lo tiene) y luego la serie. Los buscadores también las leen. */
export function refEquipo(e: { sap_id?: string | null; serie?: string | null }) {
  return [e.sap_id && `SAP ${e.sap_id}`, e.serie && `Serie ${e.serie}`].filter(Boolean).join(" · ") || null;
}

export const PROPIEDADES: { valor: Propiedad; etiqueta: string }[] = [
  { valor: "propio", etiqueta: "Propio" },
  { valor: "renta", etiqueta: "Renta" },
  { valor: "leasing", etiqueta: "Leasing" },
];

/** "Renta", "leasing", "PROPIO"… → valor guardado; null si no se reconoce. */
export function leerPropiedad(s: string | undefined): Propiedad | null {
  const t = (s ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("prop")) return "propio";
  if (t.startsWith("rent") || t.startsWith("arrend")) return "renta";
  if (t.startsWith("leas")) return "leasing";
  return null;
}
