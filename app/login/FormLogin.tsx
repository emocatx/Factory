"use client";

import { useActionState, useState } from "react";
import { iniciarSesion, registrarCuenta } from "./actions";

export function FormLogin({ siguiente, errorInicial }: { siguiente: string; errorInicial?: string }) {
  const [modo, setModo] = useState<"entrar" | "registro">("entrar");
  const [estadoE, accionE, pendE] = useActionState(iniciarSesion, errorInicial ? { error: errorInicial } : undefined);
  const [estadoR, accionR, pendR] = useActionState(registrarCuenta, undefined);
  const estado = modo === "entrar" ? estadoE : estadoR;
  const pendiente = modo === "entrar" ? pendE : pendR;

  return (
    <form action={modo === "entrar" ? accionE : accionR} className="space-y-5">
      <div>
        <h2 className="text-[28px] font-semibold leading-tight">{modo === "entrar" ? "Iniciar sesión" : "Crear cuenta"}</h2>
        <p className="mt-2 text-base text-suave">
          {modo === "entrar"
            ? "Accede con la cuenta de tu organización."
            : "Después de confirmar, darás de alta tu organización."}
        </p>
      </div>
      <input type="hidden" name="next" value={siguiente} />
      <div>
        <label className="etiqueta" htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" required autoComplete="email" className="campo" />
      </div>
      <div>
        <label className="etiqueta" htmlFor="contrasena">Contraseña</label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          required
          minLength={modo === "registro" ? 8 : undefined}
          autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          className="campo"
        />
      </div>
      {estado?.error && <p role="alert" className="rounded-xl bg-paro/10 px-4 py-3 text-[15px] text-paro-texto">{estado.error}</p>}
      {estado?.ok && <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-[15px] text-ok-texto">{estado.ok}</p>}
      <button className="btn-primario w-full" disabled={pendiente}>
        {pendiente ? "Procesando…" : modo === "entrar" ? "Entrar" : "Crear cuenta"}
      </button>
      <p className="text-center text-[15px] text-suave">
        {modo === "entrar" ? "¿Tu organización aún no usa Factory?" : "¿Ya tienes cuenta?"}{" "}
        <button
          type="button"
          className="min-h-11 cursor-pointer font-semibold text-tinta underline underline-offset-2"
          onClick={() => setModo(modo === "entrar" ? "registro" : "entrar")}
        >
          {modo === "entrar" ? "Regístrala" : "Inicia sesión"}
        </button>
      </p>
    </form>
  );
}
