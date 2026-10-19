"use client";

import { useActionState, useState } from "react";
import { iniciarSesion, recuperarContrasena, reenviarConfirmacion, registrarCuenta, type EstadoForm } from "./actions";

type Modo = "entrar" | "registro" | "recuperar";

const TEXTOS: Record<Modo, { titulo: string; sub: string; boton: string }> = {
  entrar: { titulo: "Iniciar sesión", sub: "Accede con la cuenta de tu organización.", boton: "Entrar" },
  registro: { titulo: "Crear cuenta", sub: "Después de confirmar tu correo darás de alta tu organización.", boton: "Crear cuenta" },
  recuperar: { titulo: "Recuperar acceso", sub: "Te mandamos un enlace para definir una contraseña nueva.", boton: "Enviar enlace" },
};

function Mensajes({ estado }: { estado: EstadoForm }) {
  return (
    <>
      {estado?.error && <p role="alert" className="rounded-xl bg-paro/10 px-4 py-3 text-[15px] text-paro-texto">{estado.error}</p>}
      {estado?.ok && <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-[15px] text-ok-texto">{estado.ok}</p>}
    </>
  );
}

export function FormLogin({ siguiente, errorInicial }: { siguiente: string; errorInicial?: string }) {
  const [modo, setModo] = useState<Modo>("entrar");
  const [estadoE, accionE, pendE] = useActionState(iniciarSesion, errorInicial ? { error: errorInicial } : undefined);
  const [estadoR, accionR, pendR] = useActionState(registrarCuenta, undefined);
  const [estadoP, accionP, pendP] = useActionState(recuperarContrasena, undefined);
  const [estadoRe, accionRe, pendRe] = useActionState(reenviarConfirmacion, undefined);

  const estado = modo === "entrar" ? estadoE : modo === "registro" ? estadoR : estadoP;
  const accion = modo === "entrar" ? accionE : modo === "registro" ? accionR : accionP;
  const pendiente = modo === "entrar" ? pendE : modo === "registro" ? pendR : pendP;
  const t = TEXTOS[modo];
  const correoReenvio = estadoRe?.correo ?? estado?.correo;
  const mostrarReenvio = modo !== "recuperar" && (estado?.reenviar || estadoRe?.reenviar);

  return (
    <div className="space-y-5">
      <form action={accion} className="space-y-5">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight">{t.titulo}</h2>
          <p className="mt-2 text-base text-suave">{t.sub}</p>
        </div>
        <input type="hidden" name="next" value={siguiente} />
        <div>
          <label className="etiqueta" htmlFor="correo">Correo</label>
          <input id="correo" name="correo" type="email" required autoComplete="email" className="campo" defaultValue={correoReenvio} key={modo} />
        </div>
        {modo !== "recuperar" && (
          <div>
            <div className="flex items-baseline justify-between">
              <label className="etiqueta" htmlFor="contrasena">Contraseña</label>
              {modo === "entrar" && (
                <button type="button" className="enlace mb-1.5 cursor-pointer text-sm" onClick={() => setModo("recuperar")}>¿Olvidaste tu contraseña?</button>
              )}
            </div>
            <input id="contrasena" name="contrasena" type="password" required minLength={modo === "registro" ? 8 : undefined}
              autoComplete={modo === "entrar" ? "current-password" : "new-password"} className="campo" />
            {modo === "registro" && <p className="mt-1 text-[13px] text-suave">Mínimo 8 caracteres.</p>}
          </div>
        )}
        <Mensajes estado={estado} />
        <button className="btn-primario w-full" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? "Procesando…" : t.boton}
        </button>
      </form>

      {mostrarReenvio && correoReenvio && (
        <form action={accionRe} className="space-y-3 rounded-[18px] bg-papel p-4">
          <input type="hidden" name="correo" value={correoReenvio} />
          <p className="text-[14px] text-suave">¿No te llegó el correo de confirmación a <strong className="font-medium text-tinta">{correoReenvio}</strong>?</p>
          {estadoRe && <Mensajes estado={estadoRe} />}
          <button className="btn-sec w-full text-[15px]" disabled={pendRe} aria-busy={pendRe}>{pendRe ? "Enviando…" : "Reenviar correo"}</button>
        </form>
      )}

      <p className="text-center text-[15px] text-suave">
        {modo === "entrar" ? "¿Tu organización aún no usa Factory?" : modo === "registro" ? "¿Ya tienes cuenta?" : "¿Recordaste tu contraseña?"}{" "}
        <button type="button" className="enlace min-h-11 cursor-pointer font-medium" onClick={() => setModo(modo === "entrar" ? "registro" : "entrar")}>
          {modo === "entrar" ? "Regístrala" : "Inicia sesión"}
        </button>
      </p>
    </div>
  );
}
