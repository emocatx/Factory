import Link from "next/link";
import { ESTADOS } from "@/lib/catalogos";
import type { EstatusEquipo, EstatusOrden, Prioridad } from "@/lib/tipos";

/**
 * Encabezado de página: ruta, título, subtítulo y, a la derecha, filtros y acciones. Mismas medidas que el
 * Resumen de Móviles (título 34 px, subtítulo 15 px, controles de 36-40 px), para que todas las páginas se lean igual.
 */
export function Encabezado({
  ruta,
  titulo,
  sub,
  children,
}: {
  ruta?: { href: string; texto: string }[];
  titulo: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    // relative z-20: si a la derecha hay filtros, su lista desplegable debe quedar sobre las tarjetas
    // (la animación .entrar crea un contexto de apilamiento); 20 deja la barra fija de arriba (z-30) encima.
    <header className={`entrar flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pb-5 ${children ? "relative z-20" : ""}`}>
      <div className="min-w-0 max-w-3xl">
        {ruta && ruta.length > 0 && (
          <nav aria-label="Ruta" className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-suave">
            {ruta.map((r, i) => (
              <span key={r.href} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">›</span>}
                <Link href={r.href} className="text-enlace hover:underline">{r.texto}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[28px] font-semibold leading-[1.05] tracking-tight lg:text-[34px]">{titulo}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-suave">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Kpi({
  etiqueta,
  valor,
  insignia,
  pie,
  icono,
  info,
  tono = "normal",
}: {
  etiqueta: string;
  valor: React.ReactNode;
  insignia?: { texto: string; tono: "ok" | "paro" | "alerta" | "neutro" };
  pie?: string;
  icono?: React.ReactNode;
  info?: string;
  tono?: "normal" | "paro";
}) {
  const ins = insignia && {
    ok: "bg-ok-suave text-ok-texto",
    paro: "bg-paro-suave text-paro-texto",
    alerta: "bg-alerta-suave text-alerta-texto",
    neutro: "bg-panel text-suave",
  }[insignia.tono];
  return (
    <article className="caja-panel flex h-full flex-col p-5">
      <div className="mb-2 flex items-center gap-1.5 text-[13px] text-suave">
        {/* icono gris pequeño junto a la etiqueta, sin caja: el dato es lo que resalta */}
        {icono && <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{icono}</span>}
        <p className="flex-1">{etiqueta}</p>
        {info && (
          <span className="cursor-help" title={info} aria-label={`Cómo se calcula: ${info}`} role="img">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          </span>
        )}
      </div>
      <p className={`cifra ${tono === "paro" ? "text-paro-texto" : ""}`}>{valor}</p>
      <div className="mt-auto pt-3">
        {insignia && <span className={`chip mb-2 ${ins}`}>{insignia.texto}</span>}
        {pie && <p className="text-[13px] text-suave">{pie}</p>}
      </div>
    </article>
  );
}

/** Tarjeta de un dato: etiqueta gris arriba y el contenido (normalmente una .cifra) debajo. */
export function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="caja-panel p-5">
      <p className="mb-2 text-[13px] text-suave">{titulo}</p>
      {children}
    </div>
  );
}

/**
 * Selector de vista o periodo en píldora, el mismo del Resumen: pista blanca y la opción elegida en tinta.
 * Cada opción es un enlace (la vista vive en la URL).
 */
export function Segmentado({ etiqueta, opciones, actual, scroll }: {
  etiqueta: string; opciones: { v: string; t: string; href: string }[]; actual: string; scroll?: boolean;
}) {
  return (
    <nav aria-label={etiqueta} className="inline-flex rounded-full bg-panel p-1">
      {opciones.map((o) => (
        <Link key={o.v} href={o.href} scroll={scroll} aria-current={actual === o.v ? "page" : undefined}
          className={`flex min-h-9 items-center rounded-full px-3.5 text-[14px] transition-colors duration-150 ${actual === o.v ? "bg-tinta font-semibold text-sobre-tinta" : "text-suave hover:text-tinta"}`}>
          {o.t}
        </Link>
      ))}
    </nav>
  );
}

export function ChipEstado({ e }: { e: EstatusOrden }) {
  const m = ESTADOS[e];
  return <span className={`chip ${m.clase}`}>{m.etiqueta}</span>;
}

export function ChipPrioridad({ p }: { p: Prioridad }) {
  if (p === "media") return null;
  return p === "alta" ? (
    <span className="chip bg-paro-suave text-paro-texto">Prioridad alta</span>
  ) : (
    <span className="chip bg-panel-2 text-suave">Prioridad baja</span>
  );
}

export function ChipEquipo({ e }: { e: EstatusEquipo | null }) {
  if (!e) return null;
  const m = {
    activo: ["bg-ok-suave text-ok-texto", "Disponible"],
    en_paro: ["bg-paro-suave text-paro-texto", "En paro"],
    baja: ["bg-panel-2 text-suave", "Baja"],
  }[e];
  return <span className={`chip ${m[0]}`}>{m[1]}</span>;
}

/** Barra de progreso: color por severidad, con el valor siempre escrito al lado (no depende del color). */
export function Barra({ valor, tono }: { valor: number; tono?: "ok" | "alerta" | "paro" | "tinta" | "motivo" }) {
  const v = Math.max(0, Math.min(100, valor));
  const t = tono ?? (v >= 80 ? "ok" : v >= 50 ? "alerta" : "paro");
  const c = { ok: "bg-ok", alerta: "bg-alerta", paro: "bg-paro", tinta: "bg-tinta", motivo: "bg-motivo" }[t];
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-papel" role="presentation">
      <div className={`h-full rounded-full ${c} transition-[width] duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="caja-panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-lg font-semibold">{titulo}</p>
      {children && <div className="max-w-md text-[15px] text-suave">{children}</div>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "ok" | "paro" | "alerta"; children: React.ReactNode }) {
  const c = { ok: "bg-ok-suave text-ok-texto", paro: "bg-paro-suave text-paro-texto", alerta: "bg-alerta-suave text-alerta-texto" }[tono];
  return (
    <div role={tono === "paro" ? "alert" : "status"} className={`rounded-caja px-4 py-3 text-[15px] ${c}`}>
      {children}
    </div>
  );
}

export function Seccion({ titulo, sub, extra, children }: { titulo: string; sub?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="entrar entrar-2 mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold">{titulo}</h2>
          {sub && <p className="mt-0.5 text-[14px] text-suave">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function Esqueleto({ filas = 3 }: { filas?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6 pt-4">
      <span className="sr-only">Cargando…</span>
      <div className="esqueleto h-9 w-72" />
      <div className="esqueleto h-14 w-full max-w-3xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="esqueleto h-36" />)}
      </div>
      {Array.from({ length: filas }).map((_, i) => <div key={i} className="esqueleto h-16" />)}
    </div>
  );
}
