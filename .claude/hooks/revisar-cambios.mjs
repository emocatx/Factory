#!/usr/bin/env node
/**
 * Revisión automática de Factory. Se usa de dos formas:
 *
 * 1. Hook PreToolUse de Claude Code (ver .claude/settings.json): antes de cada Edit o Write revisa el texto
 *    nuevo. Si rompe una regla sale con código 2 y el agente recibe el motivo en lugar de guardar el cambio.
 * 2. `npm run revisar`: revisa todo app/ y components/ y lista lo que no cumple (lo corre el agente de Pruebas).
 *
 * Reglas (CLAUDE.md → Sistema visual y Datos):
 * - Tamaños de letra y radios solo de la escala del sistema.
 * - Colores solo con los tokens de app/globals.css: nada de hex ni de la paleta de Tailwind (bg-blue-500…).
 * - El vidrio (vidrio, vidrio-fuerte) solo en lo que flota sobre la planta 3D.
 * - Una migración que ya está en git no se edita: se agrega una nueva.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const TAMANOS = [10, 11, 12, 13, 14, 15, 17, 20, 22, 28, 34, 38];
const NOMBRADOS = ["xs", "sm", "xl"]; // 12, 14 y 20 px
const RADIOS = [10, 12, 14, 18, 22, 24];

/** Dónde no aplica cada regla (prefijos de ruta desde la raíz del repo). */
const LIBRES = {
  tamano: ["app/login/", "app/auth/", "app/onboarding/", "components/Marca.tsx"],
  radio: ["app/login/", "app/auth/", "app/onboarding/"],
  color: ["app/layout.tsx", "components/IlustracionPilar.tsx", "components/home/", "components/planta/", "app/prueba-planta/"],
  vidrio: ["components/home/", "components/planta/", "app/prueba-planta/"],
};
const libre = (rel, regla) => LIBRES[regla].some((p) => rel === p || rel.startsWith(p));

const REGLAS = [
  {
    regla: "tamano",
    patron: /(?<![\w-])(?:[\w-]+:)*text-\[(\d+(?:\.\d+)?)px\]/g,
    falla: (m) => !TAMANOS.includes(Number(m[1])),
    texto: (m) => `letra ${m[0]} fuera de la escala (${TAMANOS.join(", ")} px): usa la más cercana o una pieza de components/ui.tsx.`,
  },
  {
    regla: "tamano",
    patron: /(?<![\w-])(?:[\w-]+:)*text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g,
    falla: (m) => !NOMBRADOS.includes(m[1]),
    texto: (m) => `letra ${m[0]} fuera de la escala: usa text-[NNpx] con un valor de la escala (${TAMANOS.join(", ")}).`,
  },
  {
    regla: "radio",
    patron: /(?<![\w-])(?:[\w-]+:)*rounded(?:-[trblse]{1,2})?-\[(\d+(?:\.\d+)?)px\]/g,
    falla: (m) => !RADIOS.includes(Number(m[1])),
    texto: (m) => `radio ${m[0]} fuera del sistema (${RADIOS.join(", ")} px; las tarjetas usan caja-panel).`,
  },
  {
    regla: "color",
    patron: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    falla: () => true,
    texto: (m) => `color ${m[0]} escrito a mano: usa un token de app/globals.css (text-tinta, bg-panel, text-paro-texto…).`,
  },
  {
    regla: "color",
    patron: /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|accent|caret|decoration|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/g,
    falla: () => true,
    texto: (m) => `color ${m[0]} de la paleta de Tailwind: usa los tokens de app/globals.css (ok, paro, alerta, renta, azul, suave…).`,
  },
  {
    regla: "vidrio",
    patron: /(?<![\w-])(?:[\w-]+:)*(?:bg-)?vidrio(?:-fuerte)?(?![\w-])/g,
    falla: () => true,
    texto: (m) => `${m[0]}: el vidrio es solo para lo que flota sobre la planta 3D; en páginas planas usa caja-panel.`,
  },
];

/** Quita comentarios conservando los saltos de línea (para que los números de línea sigan valiendo). */
const sinComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
  .replace(/(^|[^:\\"'`])\/\/.*$/gm, (m, antes) => antes + " ".repeat(m.length - antes.length));

function revisar(rel, texto) {
  const lineas = sinComentarios(texto).split("\n");
  const fallas = [];
  for (const r of REGLAS) {
    if (libre(rel, r.regla)) continue;
    lineas.forEach((linea, i) => {
      for (const m of linea.matchAll(r.patron)) if (r.falla(m)) fallas.push({ linea: i + 1, texto: r.texto(m) });
    });
  }
  return fallas;
}

function enGit(rel) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", rel], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (process.argv.includes("--todo")) {
  const archivos = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n").filter((f) => /\.(tsx|ts)$/.test(f));
  let total = 0;
  for (const rel of archivos) {
    for (const f of revisar(rel, readFileSync(path.join(RAIZ, rel), "utf8"))) {
      console.log(`${rel}:${f.linea}  ${f.texto}`);
      total++;
    }
  }
  console.log(total ? `\n${total} problema(s) de estilo en ${archivos.length} archivos.` : `Sin problemas de estilo en ${archivos.length} archivos.`);
  process.exit(total ? 1 : 0);
}

// Modo hook: llega el JSON de la herramienta por la entrada estándar. Ante cualquier duda, no bloquea.
let datos;
try {
  let crudo = "";
  for await (const trozo of process.stdin) crudo += trozo;
  datos = JSON.parse(crudo);
} catch {
  process.exit(0);
}
const entrada = datos?.tool_input ?? {};
if (typeof entrada.file_path !== "string") process.exit(0);
const rel = path.relative(RAIZ, path.resolve(entrada.file_path)).split(path.sep).join("/");
if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) process.exit(0);

if (/^supabase\/migrations\/.+\.sql$/.test(rel) && enGit(rel)) {
  console.error(`${rel} ya está guardada en git (y seguramente aplicada en la base). Una migración no se edita: crea una nueva en supabase/migrations con el siguiente número (AAAAMMDD + 6 dígitos) que haga el cambio.`);
  process.exit(2);
}
if (!/^(app|components)\/.+\.(tsx|ts)$/.test(rel)) process.exit(0);

const nuevo = datos.tool_name === "Write" ? entrada.content
  : datos.tool_name === "MultiEdit" ? (entrada.edits ?? []).map((e) => e?.new_string ?? "").join("\n")
  : entrada.new_string;
const fallas = revisar(rel, typeof nuevo === "string" ? nuevo : "");
if (!fallas.length) process.exit(0);
console.error([
  `El cambio a ${rel} no sigue el sistema visual de Factory (CLAUDE.md → Sistema visual):`,
  ...[...new Set(fallas.map((f) => f.texto))].map((t) => `- ${t}`),
  "Corrígelo y vuelve a intentar.",
].join("\n"));
process.exit(2);
