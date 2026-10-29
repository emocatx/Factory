// Escritor mínimo de .xlsx sin dependencias: hojas de texto con encabezado en negritas y fijo, anchos de
// columna y listas desplegables. Alcanza para plantillas; los reportes con formato usan CSV.

export type HojaXlsx = {
  nombre: string;
  filas: (string | number)[][];
  anchos?: number[];
  fijarEncabezado?: boolean;
  /** Lista desplegable en una columna (filas 2–5000) tomada de un rango, p. ej. "Listas!$A$2:$A$20". */
  listas?: { columna: number; rango: string }[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const letra = (i: number) => { let s = ""; for (let n = i + 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function hojaXml(h: HojaXlsx) {
  const filas = h.filas.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => {
    const ref = `${letra(j)}${i + 1}`, s = i === 0 && h.fijarEncabezado ? ' s="1"' : "";
    if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return v === "" ? "" : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const vista = h.fijarEncabezado
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
  const cols = h.anchos ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const listas = h.listas?.length
    ? `<dataValidations count="${h.listas.length}">${h.listas.map((l) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" sqref="${letra(l.columna)}2:${letra(l.columna)}5000"><formula1>${esc(l.rango)}</formula1></dataValidation>`).join("")}</dataValidations>`
    : "";
  return `${XML}<worksheet ${NS}>${vista}${cols}<sheetData>${filas}</sheetData>${listas}</worksheet>`;
}

const ESTILOS = `${XML}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

export function libroXlsx(hojas: HojaXlsx[]): Blob {
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const archivos: [string, string][] = [
    ["[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${XML}<workbook ${NS} xmlns:r="${R}"><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", ESTILOS],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)] as [string, string]),
  ];
  return new Blob([zip(archivos)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ZIP sin compresión (método 0): basta para que Excel lo abra.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(archivos: [string, string][]): Uint8Array<ArrayBuffer> {
  const te = new TextEncoder();
  const partes: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [nombre, texto] of archivos) {
    const n = te.encode(nombre), d = te.encode(texto), crc = crc32(d);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, d.length, 4], [22, d.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, t]) => (t === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    const cd = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, d.length, 4], [24, d.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, t]) => (t === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true)));
    partes.push(new Uint8Array(local.buffer), n, d);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, archivos.length, 2], [10, archivos.length, 2], [12, tamCentral, 4], [16, offset, 4]]
    .forEach(([o, v, t]) => (t === 4 ? fin.setUint32(o, v, true) : fin.setUint16(o, v, true)));
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(new ArrayBuffer(todo.reduce((s, x) => s + x.length, 0)));
  let p = 0;
  for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}
