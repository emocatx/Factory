import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/sesion";
import { PILARES, puedeAdministrar } from "@/lib/catalogos";
import { MiniPilar } from "@/components/IlustracionPilar";
import { createClient } from "@/lib/supabase/server";
import type { Pilar } from "@/lib/tipos";

export const metadata = { title: "Elige tu pilar" };

const DESCRIPCION: Record<string, string> = {
  moviles: "Montacargas, transpaletas y flota de almacén.",
  criticos: "Activos de alto impacto para la continuidad.",
  infraestructura: "Inmuebles, servicios y órdenes de instalación.",
};

function saludo() {
  const h = Number(new Intl.DateTimeFormat("es-MX", { hour: "numeric", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

const pct = (n: number) => `${n.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { perfil, tenant, pilares } = await obtenerSesion();
  const { error } = await searchParams;
  const ops = perfil.rol === "operaciones";

  // Con un solo pilar no hay nada que elegir: directo a su vista.
  const disponibles = PILARES.filter((p) => pilares.includes(p.valor) && tenant.pilares_activos.includes(p.valor));
  if (disponibles.length === 1 && !error) redirect(`/p/${disponibles[0].valor}/ordenes`);

  const supabase = await createClient();
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const cuenta = (r: { count: number | null }) => r.count ?? 0;
  const datos = await Promise.all(
    PILARES.map(async (p) => {
      if (!pilares.includes(p.valor) || !tenant.pilares_activos.includes(p.valor)) return { equipos: 0, paro: 0, fallas: 0 };
      const [eq, paro, fallas] = await Promise.all([
        supabase.from("equipos").select("id_equipo", { count: "exact", head: true }).eq("tipo_pilar", p.valor).neq("estatus", "baja"),
        supabase.from("equipos").select("id_equipo", { count: "exact", head: true }).eq("tipo_pilar", p.valor).eq("estatus", "en_paro"),
        supabase.from("ordenes_mantenimiento").select("id_orden", { count: "exact", head: true }).eq("pilar", p.valor).neq("estatus_orden", "cancelada").gte("fecha_ingreso", hace30),
      ]);
      return { equipos: cuenta(eq), paro: cuenta(paro), fallas: cuenta(fallas) };
    }),
  );
  const { count: sinAsignar } = ops
    ? { count: 0 }
    : await supabase.from("ordenes_mantenimiento").select("id_orden", { count: "exact", head: true }).in("estatus_orden", ["pendiente"]).is("asignado_a", null);
  const nombre = perfil.nombre?.trim().split(/\s+/)[0] || "";
  const meta = tenant.meta_disponibilidad_pct;

  return (
    <div className="mx-auto max-w-[1120px] md:pt-6">
      <div className="entrar text-center">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight md:text-[48px]">{saludo()}{nombre ? `, ${nombre}` : ""}</h1>
        <p className="mt-3 text-[19px] text-suave">{ops ? "¿Para qué pilar es tu solicitud?" : "¿En qué pilar vas a trabajar?"}</p>
        {!!sinAsignar && sinAsignar > 0 && (
          <p className="mt-4 inline-flex rounded-full bg-alerta-suave px-4 py-1.5 text-[14px] font-medium text-alerta-texto">
            {sinAsignar} {sinAsignar === 1 ? "orden pendiente" : "órdenes pendientes"} sin asignar
          </p>
        )}
      </div>

      {error === "pilar" && (
        <p role="alert" className="mt-8 rounded-[18px] bg-alerta-suave px-5 py-4 text-alerta-texto">
          No tienes acceso a ese pilar. Pide a un administrador que lo agregue a tu usuario.
        </p>
      )}

      <ul className="mt-10 grid gap-5 md:mt-12 md:grid-cols-3">
        {PILARES.map((p, i) => {
          const d = datos[i];
          const activo = tenant.pilares_activos.includes(p.valor);
          const permitido = pilares.includes(p.valor) && activo;
          const sinEquipos = permitido && d.equipos === 0;
          const disp = d.equipos > 0 ? ((d.equipos - d.paro) / d.equipos) * 100 : 0;
          const enMeta = disp >= meta;
          const destino = sinEquipos && puedeAdministrar(perfil.rol) ? `/p/${p.valor}/equipos` : `/p/${p.valor}/ordenes`;

          const chip = !permitido
            ? { texto: activo ? "Sin acceso" : "Aún no activo", clase: "bg-papel text-suave" }
            : sinEquipos
              ? { texto: "Por configurar", clase: "bg-papel text-tinta/80" }
              : d.paro > 0
                ? { texto: `${d.paro} detenido${d.paro === 1 ? "" : "s"}`, clase: "bg-paro-suave text-paro-texto" }
                : { texto: "Sin paros", clase: "bg-ok-suave text-ok-texto" };

          const contenido = (
            <>
              <div className="flex items-start justify-between gap-3">
                <MiniPilar pilar={p.valor as Pilar} ancho={104} alto={48} hueco="#ffffff" />
                <span className={`chip ${chip.clase}`}>{chip.texto}</span>
              </div>
              <div>
                <h2 className="text-[26px] font-semibold leading-tight">{p.etiqueta}</h2>
                <p className="mt-1 text-[15px] text-suave">{DESCRIPCION[p.valor] ?? p.descripcion}</p>
              </div>

              {permitido && !sinEquipos && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[14px]">
                    <span className="text-suave">Disponibilidad</span>
                    <span className="font-semibold tabular-nums">{pct(disp)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-2" aria-hidden="true">
                    <div className={`h-full rounded-full ${enMeta ? "bg-ok" : "bg-alerta"}`} style={{ width: `${Math.max(0, Math.min(100, disp))}%` }} />
                  </div>
                  <div className="flex justify-between text-[14px] text-suave tabular-nums">
                    <span>{d.equipos.toLocaleString("es-MX")} equipos</span>
                    <span>{d.fallas.toLocaleString("es-MX")} fallas en 30 días</span>
                  </div>
                </div>
              )}
              {sinEquipos && (
                <p className="text-[14px] leading-relaxed text-suave">
                  Aún no hay equipos registrados.{puedeAdministrar(perfil.rol) ? " Cárgalos en bloque desde Excel para empezar a medir." : " Un administrador debe darlos de alta."}
                </p>
              )}

              <span className={`mt-auto text-[15px] font-semibold ${permitido ? "text-enlace" : "text-suave"}`}>
                {!permitido ? (activo ? "Pide acceso a un administrador" : "Se activa en Configuración") : sinEquipos && puedeAdministrar(perfil.rol) ? "Cargar equipos ›" : ops ? "Ver mis solicitudes ›" : `Entrar a ${p.etiqueta} ›`}
              </span>
            </>
          );
          const clase = "flex h-full flex-col gap-5 rounded-caja bg-panel p-7";
          return (
            <li key={p.valor} className={`entrar entrar-${Math.min(i + 1, 4)}`}>
              {permitido ? (
                <Link href={destino} className={`tarjeta-enlace ${clase}`}>{contenido}</Link>
              ) : (
                <div className={`${clase} opacity-60`} aria-disabled="true">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>

      {meta > 0 && !ops && (
        <p className="mt-8 text-center text-[14px] text-suave">La barra se pinta en verde cuando la disponibilidad alcanza la meta de {pct(meta)}.</p>
      )}
    </div>
  );
}
