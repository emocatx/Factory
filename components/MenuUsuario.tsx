import Link from "next/link";
import { cerrarSesion } from "@/app/login/actions";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaRol } from "@/lib/catalogos";
import type { Rol } from "@/lib/tipos";
import { InterruptorTema } from "@/components/Tema";

const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICONOS: Record<string, React.ReactNode> = {
  inicio: <><path {...trazo} d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" /></>,
  historial: <><circle {...trazo} cx="12" cy="12" r="8" /><path {...trazo} d="M12 8v4l3 2" /></>,
  configuracion: <><circle {...trazo} cx="12" cy="12" r="3" /><path {...trazo} d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  usuarios: <><circle {...trazo} cx="9" cy="8" r="3.2" /><path {...trazo} d="M3.5 19c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5" /><circle {...trazo} cx="16.5" cy="9" r="2.4" /><path {...trazo} d="M16 13.5c2.2 0 3.8 1.3 4.5 4" /></>,
  recorrido: <><circle {...trazo} cx="12" cy="12" r="8" /><path {...trazo} d="M14.8 9.2l-1.6 4-4 1.6 1.6-4z" /></>,
};

function Fila({ href, icono, texto, recarga }: { href: string; icono: string; texto: string; recarga?: boolean }) {
  const clase = "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-tinta transition-colors hover:bg-papel";
  const cuerpo = (
    <>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-suave" aria-hidden="true">{ICONOS[icono]}</svg>
      {texto}
    </>
  );
  // El recorrido se abre al leer ?tour=1, por eso ese enlace recarga la página a propósito.
  return recarga ? <a href={href} className={clase}>{cuerpo}</a> : <Link href={href} className={clase}>{cuerpo}</Link>;
}

/** Menú de la cuenta: tarjeta de perfil, navegación, ajustes y salida (inspirado en un menú de perfil por tarjetas). */
export function MenuUsuario({ nombre, correo, rol, empresa, enlaces }: {
  nombre: string; correo: string; rol: Rol; empresa: string; enlaces: { href: string; texto: string }[];
}) {
  const iniciales = nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const historial = enlaces.filter((e) => e.href === "/historial");
  const ajustes = enlaces.filter((e) => e.href !== "/historial");
  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full bg-papel py-1 pl-1 pr-3 text-sm hover:bg-panel-2" aria-label={`Cuenta de ${nombre}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tinta text-[13px] font-semibold text-sobre-tinta" aria-hidden="true">{iniciales}</span>
        <span className="hidden font-medium sm:inline">{nombre.split(" ")[0]}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(320px,calc(100vw-24px))] rounded-[24px] bg-papel p-1.5 shadow-[0_16px_40px_rgb(17_18_20/0.18)]">
        {/* tarjeta de perfil */}
        <div className="flex items-center gap-3 rounded-[18px] bg-panel p-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tinta text-[15px] font-semibold text-sobre-tinta" aria-hidden="true">
            {iniciales}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-ok ring-2 ring-panel" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{nombre}</span>
            <span className="block truncate text-[13px] text-suave">{correo}</span>
          </span>
          <span className="chip shrink-0 bg-ok-suave text-ok-texto">{etiquetaRol(rol)}</span>
        </div>

        {/* navegación y ajustes */}
        <div className="mt-1.5 rounded-[18px] bg-panel p-1.5">
          <Fila href="/" icono="inicio" texto="Pilares" />
          {historial.map((e) => <Fila key={e.href} href={e.href} icono="historial" texto={e.texto} />)}
          <div className="mx-3 my-1.5 h-px bg-panel-2" aria-hidden="true" />
          {ajustes.map((e) => <Fila key={e.href} href={e.href} icono={e.href.slice(1)} texto={e.texto} />)}
          <InterruptorTema />
          <Fila href="?tour=1" icono="recorrido" texto="Ver recorrido de bienvenida" recarga />
        </div>

        {/* pie */}
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="truncate text-[13px] text-suave">{empresa}</span>
          <form action={cerrarSesion}>
            <BotonEnviar className="btn-sec min-h-10 px-4 text-[14px]" pendiente="Saliendo…">Cerrar sesión</BotonEnviar>
          </form>
        </div>
      </div>
    </details>
  );
}
