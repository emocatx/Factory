import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Marca } from "@/components/Marca";
import { crearOrganizacion } from "./actions";
import { BotonEnviar } from "@/components/BotonEnviar";

export const metadata = { title: "Alta de organización" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("usuarios_perfiles").select("id").eq("id", user.id).maybeSingle();
  if (perfil) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-papel px-4 py-10">
      <form action={crearOrganizacion} className="caja-panel w-full max-w-md space-y-5 p-8 md:p-10">
        <Marca />
        <div>
          <h1 className="text-[34px] font-semibold leading-tight">Da de alta tu organización</h1>
          <p className="mt-1 text-sm text-suave">
            Serás el administrador. Tus almacenes, equipos y folios quedarán aislados de cualquier otra empresa.
          </p>
        </div>
        <div>
          <label className="etiqueta" htmlFor="empresa">Nombre de la empresa</label>
          <input id="empresa" name="empresa" required className="campo" placeholder="Ej. Distribuidora del Bajío" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="nombre">Tu nombre</label>
          <input id="nombre" name="nombre" required className="campo" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-paro/10 px-4 py-3 text-[15px] text-paro-texto">{error}</p>}
        <BotonEnviar className="btn-primario w-full" pendiente="Creando…">Crear organización</BotonEnviar>
        <p className="text-xs text-suave">
          ¿Te invitaron a una organización existente? Abre el enlace del correo de invitación en lugar de crear una nueva.
        </p>
      </form>
    </main>
  );
}
