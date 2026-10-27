"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoSeccion } from "./IconosSeccion";

type Item = { href: string; texto: string };

/** Ancho de la barra plegada (el que reserva el layout del pilar). */
export const ANCHO_BARRA = 56;

/**
 * Navegación del pilar. En escritorio es un riel discreto de iconos grises que se despliega con su
 * nombre al pasar el mouse o al llegar con el teclado (se abre encima del contenido, sin moverlo).
 * En celular es una tira horizontal. Sustituye al título grande y a la fila de secciones.
 */
/** Etiqueta de grupo: solo se ve con la barra desplegada (como "Menú 6" de la referencia). */
function Grupo({ titulo, cuantos }: { titulo: string; cuantos: number }) {
  return (
    <p className="mt-2 h-5 whitespace-nowrap px-2.5 text-[11px] text-suave opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {titulo} <span className="font-semibold text-tinta">{cuantos}</span>
    </p>
  );
}

function Elemento({ href, texto, clave, activo, etiqueta }: { href: string; texto: string; clave: string; activo: boolean; etiqueta?: string }) {
  return (
    <Link href={href} aria-current={activo ? "page" : undefined} title={texto}
      className={`relative flex min-h-10 items-center gap-3 rounded-xl px-2.5 transition-colors ${activo ? "bg-papel text-tinta" : "text-suave hover:bg-papel hover:text-tinta"}`}>
      {/* marca de la sección activa en el borde, como en la referencia */}
      {activo && <span className="absolute -left-1.5 top-2 bottom-2 w-[3px] rounded-r-full bg-azul" aria-hidden="true" />}
      <span className="shrink-0"><IconoSeccion clave={clave} chico /></span>
      <span className={`whitespace-nowrap text-[13px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${activo ? "font-semibold" : "font-medium"}`}>{texto}</span>
      {etiqueta && (
        <span className="absolute left-7 top-1 rounded-full bg-paro px-1 text-[9px] font-semibold leading-[14px] text-white group-hover:static group-hover:ml-auto group-hover:text-[10px] group-focus-within:static group-focus-within:ml-auto"
          aria-label={`${etiqueta} abiertas`}>{etiqueta}</span>
      )}
    </Link>
  );
}

export function BarraPilar({ items, generales, abiertas, pilar, usuario, accion }: {
  items: Item[]; generales: Item[]; abiertas: number; pilar: string; usuario: string; accion: Item | null;
}) {
  const ruta = usePathname();
  const iniciales = usuario.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const datos = items.map((i) => {
    const seg = i.href.split("/").pop() ?? "";
    return {
      ...i,
      clave: i.texto === "Seguimiento" ? "seguimiento" : seg,
      // Cerradas vive dentro de la sección Órdenes.
      activo: ruta === i.href || ruta.startsWith(i.href + "/") || (seg === "ordenes" && ruta.endsWith("/cerradas")),
      etiqueta: seg === "ordenes" && abiertas > 0 ? String(abiertas) : undefined,
    };
  });

  return (
    <nav aria-label={`Secciones de ${pilar}`} className="lg:sticky lg:top-[72px] lg:z-30 lg:self-start">
      {/* Escritorio: riel plegado que se despliega encima del contenido */}
      <div className="relative hidden lg:block" style={{ width: ANCHO_BARRA }}>
        <div className="group absolute left-0 top-0 flex w-14 flex-col overflow-hidden rounded-[22px] bg-panel/90 p-1.5 backdrop-blur-xl transition-[width,box-shadow] duration-200 ease-out hover:w-[200px] hover:shadow-[0_12px_32px_rgb(0_0_0/0.12)] focus-within:w-[200px] focus-within:shadow-[0_12px_32px_rgb(0_0_0/0.12)]">
          {/* quién soy y en qué pilar estoy */}
          <Link href="/" title="Volver a pilares" className="flex min-h-12 items-center gap-2.5 rounded-xl px-1.5 hover:bg-papel">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta text-[12px] font-semibold text-sobre-tinta" aria-hidden="true">{iniciales}</span>
            <span className="min-w-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <span className="block truncate text-[13px] font-semibold leading-tight">{usuario}</span>
              <span className="block whitespace-nowrap text-[11px] text-enlace">‹ {pilar}</span>
            </span>
          </Link>
          <Grupo titulo="Secciones" cuantos={datos.length} />
          {datos.map((i) => <Elemento key={i.href} {...i} />)}
          {generales.length > 0 && <Grupo titulo="General" cuantos={generales.length} />}
          {generales.map((g) => <Elemento key={g.href} {...g} clave={g.href.slice(1)} activo={ruta.startsWith(g.href)} />)}
          {/* acción principal, como el "crear" de la referencia */}
          {accion && (
            <Link href={accion.href} title={accion.texto}
              className="mt-2 flex min-h-11 items-center gap-2.5 rounded-2xl bg-papel p-1.5 hover:bg-panel-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-azul text-[18px] leading-none text-sobre-azul" aria-hidden="true">+</span>
              <span className="whitespace-nowrap text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{accion.texto}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Celular y tablet: tira horizontal compacta */}
      <div className="-mx-3 mb-3 overflow-x-auto px-3 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max gap-1.5">
          <li><Link href="/" className="flex min-h-10 items-center rounded-full bg-panel px-3 text-[14px] text-enlace">‹ {pilar}</Link></li>
          {datos.map((i) => (
            <li key={i.href}>
              <Link href={i.href} aria-current={i.activo ? "page" : undefined}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] ${i.activo ? "bg-tinta font-semibold text-sobre-tinta" : "bg-panel text-tinta"}`}>
                {i.texto}
                {i.etiqueta && <span className={`rounded-full px-1.5 text-[11px] font-semibold ${i.activo ? "bg-sobre-tinta/20" : "bg-paro-suave text-paro-texto"}`}>{i.etiqueta}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** Todas las páginas del pilar usan el ancho completo junto a la barra lateral; la planta 3D, además, sin margen arriba. */
export function ContenidoPilar({ children }: { children: React.ReactNode }) {
  const planta = usePathname().endsWith("/moviles/resumen");
  return <div className={planta ? "min-w-0" : "min-w-0 lg:px-2 lg:pt-4"}>{children}</div>;
}
