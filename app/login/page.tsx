import { FormLogin } from "./FormLogin";
import { Marca } from "@/components/Marca";

export const metadata = { title: "Iniciar sesión" };

const PILARES = ["Móviles", "Dorsales", "Sistemas Críticos", "Infraestructura"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="min-h-dvh bg-papel px-4 pb-16 pt-10 md:pt-16">
      <div className="mx-auto max-w-[980px]">
        <Marca />
        <div className="mt-12 grid items-start gap-10 md:mt-20 lg:grid-cols-[1fr_420px]">
          <section>
            <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[64px]">Cada paro, registrado. Cada cierre, medido.</h1>
            <p className="mt-5 max-w-lg text-[19px] text-suave md:text-[21px]">
              Seguimiento de fallas de tus cuatro pilares, con MTTR, MTBF y disponibilidad al momento.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {PILARES.map((p) => (
                <li key={p} className="rounded-full bg-panel px-4 py-1.5 text-[15px] font-medium">{p}</li>
              ))}
            </ul>
          </section>
          <section className="caja-panel p-8">
            <FormLogin siguiente={next ?? "/"} errorInicial={error === "inactivo" ? "Tu usuario está desactivado. Pide a tu administrador que lo reactive." : undefined} />
          </section>
        </div>
        <p className="mt-16 text-[13px] text-suave">Factory · Anacronyc y JRia</p>
      </div>
    </main>
  );
}
