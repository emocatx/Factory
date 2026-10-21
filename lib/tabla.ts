/** Lectura de tablas pegadas desde Excel o de archivos .xlsx / .csv (en el navegador). */

export type Columna = { clave: string; etiqueta: string; requerida?: boolean; alias?: readonly string[]; ejemplo?: string };
type Fila = Record<string, string>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Separa texto pegado de Excel (tabulador) o CSV (coma / punto y coma), respetando comillas,
 * incluidos saltos de línea dentro de una celda (descripciones largas).
 */
export function partirTexto(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const primera = t.slice(0, t.indexOf("\n") >= 0 ? t.indexOf("\n") : undefined);
  if (!primera.trim()) return [];
  const sep = primera.includes("\t") ? "\t" : (primera.split(";").length > primera.split(",").length ? ";" : ",");
  const filas: string[][] = [];
  let fila: string[] = [], celda = "", comillas = false, inicioCelda = true;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
      else celda += ch;
    } else if (ch === '"' && inicioCelda) { comillas = true; inicioCelda = false; }
    else if (ch === sep) { fila.push(celda.trim()); celda = ""; inicioCelda = true; }
    else if (ch === "\n") {
      fila.push(celda.trim()); celda = ""; inicioCelda = true;
      if (fila.some((c) => c !== "")) filas.push(fila);
      fila = [];
    } else { celda += ch; if (ch !== " ") inicioCelda = false; }
  }
  fila.push(celda.trim());
  if (fila.some((c) => c !== "")) filas.push(fila);
  return filas;
}

/** Convierte la tabla a filas por columna. Si la primera fila trae encabezados reconocibles los usa; si no, va por posición. */
export function aFilas(tabla: string[][], columnas: readonly Columna[]): Fila[] {
  if (!tabla.length) return [];
  const enc = tabla[0].map(norm);
  const indice = columnas.map((c) => {
    const nombres = [c.etiqueta, c.clave, ...(c.alias ?? [])].map(norm);
    return enc.findIndex((h) => nombres.includes(h));
  });
  const conEncabezado = indice.some((i) => i >= 0);
  const datos = conEncabezado ? tabla.slice(1) : tabla;
  return datos
    .map((r) => Object.fromEntries(columnas.map((c, j) => [c.clave, String((conEncabezado ? (indice[j] >= 0 ? r[indice[j]] : "") : r[j]) ?? "").trim()])))
    .filter((f) => Object.values(f).some((v) => v !== ""));
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Lee un .xlsx (primera hoja) o .csv/.txt/.tsv. Devuelve null si el formato no se reconoce. */
export async function leerArchivoTabla(archivo: File): Promise<string[][] | null> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const datos = await readSheet(archivo);
    // Las fechas de Excel llegan como Date con la hora "de pared" en UTC: se conservan día y hora.
    return datos.map((r) => r.map((c) => {
      if (c == null) return "";
      if (c instanceof Date) {
        const base = `${c.getUTCFullYear()}-${p2(c.getUTCMonth() + 1)}-${p2(c.getUTCDate())}`;
        return c.getUTCHours() || c.getUTCMinutes() ? `${base} ${p2(c.getUTCHours())}:${p2(c.getUTCMinutes())}:${p2(c.getUTCSeconds())}` : base;
      }
      return String(c);
    }));
  }
  if (/\.(csv|txt|tsv)$/i.test(archivo.name)) return partirTexto(await archivo.text());
  return null;
}
