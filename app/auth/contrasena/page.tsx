"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Marca } from "@/components/Marca";

export default function NuevaContrasena() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pend, setPend] = useState(false);

  async function guardar(form: FormData) {
    const c = String(form.get("c") ?? "");
    if (c.length < 8) return setError("Mínimo 8 caracteres.");
    if (c !== form.get("c2")) return setError("Las contraseñas no coinciden.");
    setPend(true);
    const { error } = await createClient().auth.updateUser({ password: c });
    setPend(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form action={guardar} className="w-full max-w-sm space-y-5">
        <Marca />
        <h1 className="text-[34px] font-semibold leading-tight">Define tu contraseña</h1>
        <div>
          <label className="etiqueta" htmlFor="c">Nueva contraseña</label>
          <input id="c" name="c" type="password" className="campo" autoComplete="new-password" required />
        </div>
        <div>
          <label className="etiqueta" htmlFor="c2">Confírmala</label>
          <input id="c2" name="c2" type="password" className="campo" autoComplete="new-password" required />
        </div>
        {error && <p role="alert" className="rounded-xl bg-paro/10 px-4 py-3 text-[15px] text-paro-texto">{error}</p>}
        <button className="btn-primario w-full" disabled={pend}>{pend ? "Guardando…" : "Guardar y entrar"}</button>
      </form>
    </main>
  );
}
