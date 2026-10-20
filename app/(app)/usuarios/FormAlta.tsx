"use client";

import { useActionState, useState } from "react";
import { PILARES } from "@/lib/catalogos";
import type { Pilar, Rol } from "@/lib/tipos";
import { crearConContrasena, invitarUsuario } from "./actions";
import { Desplegable } from "@/components/Desplegable";
import { IcoPersona } from "@/components/Iconos";

type Props = { roles: { valor: Rol; etiqueta: string }[]; disponibles: Pilar[]; rolInicial: Rol; esCoordinador: boolean; sitio: string };

export function FormAlta({ roles, disponibles, rolInicial, esCoordinador, sitio }: Props) {
  const [modo, setModo] = useState<"clave" | "correo">("clave");
  const [estado, accion, pend] = useActionState(crearConContrasena, undefined);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!estado?.clave) return;
    const texto = `Factory · ${sitio}\nUsuario: ${estado.correo}\nContraseña temporal: ${estado.clave}`;
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); }
  }

  return (
    <section className="caja-panel mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Agregar persona</h2>
          <p className="mt-1 max-w-xl text-[15px] text-suave">
            {modo === "clave" ? "Creas su cuenta con una contraseña temporal que tú le compartes. No necesita correo." : "Recibirá un correo para crear su contraseña (requiere SMTP propio en Supabase)."}
            {esCoordinador && " Puedes dar de alta supervisores, técnicos, operaciones y lectores de tus pilares."}
          </p>
        </div>
        <div role="radiogroup" aria-label="Forma de alta" className="inline-flex rounded-full bg-papel p-1 text-[14px]">
          {([["clave", "Contraseña temporal"], ["correo", "Invitación por correo"]] as const).map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => setModo(v)}
              className={`min-h-9 cursor-pointer rounded-full px-4 ${modo === v ? "bg-tinta font-medium text-white" : "text-tinta hover:bg-panel-2"}`}>{t}</button>
          ))}
        </div>
      </div>

      <form action={modo === "clave" ? accion : invitarUsuario} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_200px]">
        <label><span className="etiqueta">Nombre</span><input name="nombre" className="campo" placeholder="Nombre y apellido" /></label>
        <label><span className="etiqueta">Correo</span><input name="correo" type="email" className="campo" placeholder="nombre@empresa.com" required /></label>
        <div><label htmlFor="alta-rol" className="etiqueta">Rol</label>
          <Desplegable id="alta-rol" name="rol" defaultValue={rolInicial} icono={<IcoPersona />}
            opciones={roles.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta }))} /></div>
        <fieldset className="md:col-span-2">
          <legend className="etiqueta">Pilares (administrador y gerente ven todos)</legend>
          <div className="flex flex-wrap gap-1.5">
            {PILARES.filter((p) => disponibles.includes(p.valor)).map((p) => (
              <label key={p.valor} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-papel px-3 text-sm has-[:checked]:bg-tinta has-[:checked]:text-white">
                <input type="checkbox" name="pilares" value={p.valor} defaultChecked className="sr-only" /> {p.etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-end">
          <button className="btn-primario w-full" disabled={pend} aria-busy={pend}>
            {pend ? "Creando…" : modo === "clave" ? "Crear cuenta" : "Enviar invitación"}
          </button>
        </div>
      </form>

      {modo === "clave" && estado?.error && <p role="alert" className="mt-4 rounded-xl bg-paro-suave px-4 py-3 text-[15px] text-paro-texto">{estado.error}</p>}
      {modo === "clave" && estado?.ok && estado.clave && (
        <div role="status" className="mt-4 rounded-[18px] bg-ok-suave p-5">
          <p className="text-[15px] text-ok-texto">{estado.ok}</p>
          <dl className="mt-3 grid gap-1 text-[15px] sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-suave">Usuario</dt><dd className="font-medium">{estado.correo}</dd>
            <dt className="text-suave">Contraseña temporal</dt><dd className="select-all font-mono text-[17px] font-semibold tracking-wide">{estado.clave}</dd>
          </dl>
          <button type="button" onClick={copiar} className="btn-sec mt-4 min-h-10 text-[15px]">{copiado ? "Copiado" : "Copiar datos de acceso"}</button>
          <p className="mt-3 text-[13px] text-suave">Esta contraseña no se vuelve a mostrar. Si se pierde, crea una nueva desde aquí.</p>
        </div>
      )}
    </section>
  );
}
