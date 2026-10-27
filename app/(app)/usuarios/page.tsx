import { createClient } from "@/lib/supabase/server";
import { exigirRol } from "@/lib/sesion";
import { Aviso, Encabezado } from "@/components/ui";
import { etiquetaPilar, etiquetaRol, PILARES, ROLES, ROLES_GESTORES, rolesQueOtorga, veTodosLosPilares } from "@/lib/catalogos";
import { actualizarUsuario } from "./actions";
import { FormAlta } from "./FormAlta";
import type { Perfil, Pilar } from "@/lib/tipos";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Desplegable } from "@/components/Desplegable";

export const metadata = { title: "Usuarios" };

function Pilares({ marcados, prefijo, disponibles }: { marcados: Pilar[]; prefijo: string; disponibles: Pilar[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PILARES.filter((p) => disponibles.includes(p.valor)).map((p) => (
        <label key={p.valor} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-papel px-3 text-sm has-[:checked]:bg-tinta has-[:checked]:text-sobre-tinta">
          <input type="checkbox" name="pilares" value={p.valor} defaultChecked={marcados.includes(p.valor)} className="sr-only" id={`${prefijo}-${p.valor}`} />
          {p.etiqueta}
        </label>
      ))}
    </div>
  );
}

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { perfil: yo, tenant, pilares: misPilares } = await exigirRol(ROLES_GESTORES);
  const otorga = ROLES.filter((r) => rolesQueOtorga(yo.rol).includes(r.valor));
  const disponibles = veTodosLosPilares(yo.rol) ? tenant.pilares_activos : misPilares;
  const alcance = yo.rol === "admin" ? "Puedes dar de alta cualquier rol."
    : `Como ${etiquetaRol(yo.rol).toLowerCase()} puedes dar de alta: ${otorga.map((r) => r.etiqueta.toLowerCase()).join(", ")}${veTodosLosPilares(yo.rol) ? "" : ", de tus pilares"}.`;
  const editable = (u: Perfil) => u.id !== yo.id && (yo.rol === "admin" || rolesQueOtorga(yo.rol).includes(u.rol));
  const sp = await searchParams;
  const { data } = await (await createClient())
    .from("usuarios_perfiles")
    .select("id, tenant_id, nombre, correo, rol, activo, pilares")
    .order("nombre");
  const usuarios = (data ?? []) as Perfil[];

  return (
    <>
      <Encabezado ruta={[{ href: "/", texto: "Pilares" }]} titulo="Usuarios" sub={`Personas de ${tenant.nombre_empresa}. El rol define qué pueden hacer y los pilares, dónde.`} />
      {sp.ok && <div className="mb-6"><Aviso tono="ok">{sp.ok}</Aviso></div>}
      {sp.error && <div className="mb-6" role="alert"><Aviso tono="paro">{sp.error}</Aviso></div>}

      <FormAlta roles={otorga} disponibles={disponibles} rolInicial={otorga.some((r) => r.valor === "tecnico") ? "tecnico" : otorga[0].valor} alcance={alcance} sitio={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />

      <section className="caja-panel mb-6 p-6">
        <h2 className="text-xl font-semibold">Qué hace cada rol</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((r) => (
            <div key={r.valor}><dt className="font-semibold">{r.etiqueta}</dt><dd className="text-suave">{r.descripcion}</dd></div>
          ))}
        </dl>
      </section>

      <ul className="space-y-3">
        {usuarios.map((u) => (
          <li key={u.id} className={`caja-panel p-5 ${u.activo ? "" : "opacity-70"}`}>
            {editable(u) ? (
              <form action={actualizarUsuario} className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.2fr)_200px_minmax(0,1.6fr)_auto]">
                <input type="hidden" name="id" value={u.id} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.nombre}</p>
                  <p className="truncate text-sm text-suave">{u.correo}</p>
                </div>
                <div><label htmlFor={`rol-${u.id}`} className="sr-only">Rol de {u.nombre}</label>
                  <Desplegable id={`rol-${u.id}`} name="rol" defaultValue={u.rol} compacto
                    opciones={otorga.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta }))} /></div>
                <fieldset><legend className="sr-only">Pilares de {u.nombre}</legend><Pilares marcados={u.pilares ?? []} prefijo={u.id} disponibles={disponibles} /></fieldset>
                <div className="flex items-center gap-4">
                  <label className="inline-flex min-h-11 items-center gap-2 text-[15px]">
                    <input type="checkbox" name="activo" defaultChecked={u.activo} className="h-5 w-5" /> Activo
                  </label>
                  <BotonEnviar className="btn-sec min-h-11">Guardar</BotonEnviar>
                </div>
              </form>
            ) : (
              <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.2fr)_200px_minmax(0,1.6fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.nombre}{u.id === yo.id && <span className="ml-2 text-sm font-normal text-suave">(tú)</span>}</p>
                  <p className="truncate text-sm text-suave">{u.correo}</p>
                </div>
                <p className="text-[15px] font-medium">{etiquetaRol(u.rol)}</p>
                <p className="text-[14px] text-suave">{u.rol === "admin" || u.rol === "gerente" ? "Todos los pilares" : (u.pilares ?? []).map(etiquetaPilar).join(", ") || "Sin pilares"}</p>
                <p className="text-[13px] text-suave">{u.activo ? "Activo" : "Inactivo"}{u.id !== yo.id && " · solo lectura"}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
