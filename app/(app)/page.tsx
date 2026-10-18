import Link from "next/link";
import { obtenerSesion } from "@/lib/sesion";
import { PILARES } from "@/lib/catalogos";
import { IlustracionPilar, MiniPilar } from "@/components/IlustracionPilar";
import { TiraNav } from "@/components/TiraNav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pilares de trabajo" };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { perfil, tenant, pilares } = await obtenerSesion();
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: abiertas } = await supabase
    .from("ordenes_mantenimiento")
    .select("pilar, asignado_a")
    .in("estatus_orden", ["pendiente", "asignada", "en_proceso"]);
  const porPilar = new Map<string, number>();
  (abiertas ?? []).forEach((o) => porPilar.set(o.pilar, (porPilar.get(o.pilar) ?? 0) + 1));
  const sinAsignar = (abiertas ?? []).filter((o) => !o.asignado_a).length;
  const ops = perfil.rol === "operaciones";

  const estadoDe = (valor: (typeof PILARES)[number]["valor"]) => {
    const activo = tenant.pilares_activos.includes(valor);
    const n = porPilar.get(valor) ?? 0;
    return { activo, permitido: pilares.includes(valor), n, texto: !activo ? "Preparado" : n > 0 ? `${n} abierta${n === 1 ? "" : "s"}` : "" };
  };

  return (
    <>
      {sinAsignar > 0 && !ops && (
        <p className="-mt-8 mb-10 mx-[calc(50%-50vw)] bg-panel-2/60 px-4 py-3 text-center text-[14px] md:-mt-12 md:mb-14">
          {sinAsignar} {sinAsignar === 1 ? "orden" : "órdenes"} sin asignar en tus pilares. <Link href={`/p/${pilares[0] ?? "moviles"}/ordenes?estado=pendiente`} className="enlace">Revisar ›</Link>
        </p>
      )}

      <h1 className="entrar text-[48px] font-semibold leading-none md:text-[80px]">Pilares</h1>
      <p className="entrar mt-3 max-w-xl text-[19px] text-suave md:text-[21px]">
        {ops ? "Levanta solicitudes para mantenimiento y sigue su avance hasta el cierre." : `Mantenimiento de ${tenant.nombre_empresa}, organizado por frente de trabajo.`}
      </p>

      <div className="entrar entrar-2 mt-10">
        <TiraNav
          etiquetaNav="Pilares"
          items={PILARES.map((p) => {
            const e = estadoDe(p.valor);
            return { href: `/p/${p.valor}/ordenes`, texto: p.etiqueta, visual: <MiniPilar pilar={p.valor} />, etiqueta: e.texto, deshabilitado: !e.permitido };
          })}
        />
      </div>

      {error === "pilar" && (
        <p role="alert" className="mt-8 rounded-[18px] bg-alerta-suave px-5 py-4 text-alerta-texto">
          No tienes acceso a ese pilar. Pide a un administrador que lo agregue a tu usuario.
        </p>
      )}

      <ul className="mt-12 grid gap-5 md:grid-cols-2">
        {PILARES.map((p, i) => {
          const e = estadoDe(p.valor);
          const contenido = (
            <>
              <div className="px-8 pt-10 text-center md:pt-12">
                <h2 className="text-[32px] font-semibold leading-tight md:text-[40px]">{p.etiqueta}</h2>
                <p className="mx-auto mt-2 max-w-sm text-[17px] text-tinta/80">{p.descripcion}</p>
                <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[17px]">
                  {e.permitido ? <span className="enlace">{ops ? "Ver mis solicitudes" : "Entrar"} ›</span> : <span className="text-suave">{e.activo ? "Sin acceso" : "Aún no activo"}</span>}
                  {e.activo && <span className={e.n > 0 ? "font-medium text-nuevo" : "text-ok-texto"}>{e.n > 0 ? e.texto : "Sin paros"}</span>}
                </p>
              </div>
              <IlustracionPilar pilar={p.valor} className="mt-6 h-44 md:h-56" />
            </>
          );
          return (
            <li key={p.valor} className={`entrar entrar-${Math.min(i + 1, 4)}`}>
              {e.permitido ? (
                <Link href={`/p/${p.valor}/ordenes`} className="tarjeta-enlace flex h-full flex-col overflow-hidden">{contenido}</Link>
              ) : (
                <div className="caja-panel flex h-full flex-col overflow-hidden opacity-60" aria-disabled="true">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
