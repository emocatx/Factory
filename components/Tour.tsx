"use client";

import { useEffect, useRef, useState } from "react";
import { marcarTourVisto } from "@/app/(app)/acciones-tour";
import { etiquetaRol } from "@/lib/catalogos";
import type { Rol } from "@/lib/tipos";

type Paso = { titulo: string; texto: string };

/** Lo que cada rol necesita saber primero. */
function pasosDe(rol: Rol, empresa: string, nombre: string): Paso[] {
  const inicio: Paso = { titulo: `Hola, ${nombre}`, texto: `Te damos la bienvenida a Factory de ${empresa}. Entraste como ${etiquetaRol(rol).toLowerCase()}. Este recorrido toma un minuto.` };
  const pilares: Paso = { titulo: "Pilares y secciones", texto: "Arriba eliges el pilar (Móviles, Críticos, Infraestructura). Dentro de cada uno, las pestañas te llevan a Resumen, Órdenes, Registro, Indicadores y Análisis." };
  const resumen: Paso = { titulo: "El Resumen", texto: "En la computadora verás la planta en 3D: los equipos en Mantto van en rojo y los que operan en amarillo con torreta verde. En el celular verás las mismas cifras en tarjetas. Toca \"En Mantto\" para ver qué equipos están detenidos." };
  const final: Paso = { titulo: "Listo", texto: "Puedes volver a ver este recorrido cuando quieras desde tu menú, arriba a la derecha." };
  const porRol: Record<Rol, Paso[]> = {
    admin: [resumen, { titulo: "Administración", texto: "En Configuración defines almacenes, equipos, catálogos de falla y metas. En Usuarios das de alta a cualquier rol." }],
    gerente: [resumen, { titulo: "Indicadores", texto: "Disponibilidad, MTTR y MTBF de todos los pilares están en Indicadores; el detalle de fallas, en Análisis. En Usuarios puedes dar de alta coordinadores y su equipo." }],
    coordinador: [resumen, { titulo: "Tu equipo", texto: "En Órdenes asignas el trabajo. En Usuarios das de alta supervisores, técnicos, operaciones y lectores de tus pilares." }],
    supervisor: [resumen, { titulo: "Asignar y cerrar", texto: "Cuando haya órdenes sin asignar, el Resumen te lo dirá arriba con un botón para asignarlas. En Usuarios puedes dar de alta técnicos, uno o varios a la vez." }],
    tecnico: [{ titulo: "Registrar una falla", texto: "Cuando un equipo falle, entra a Registro: eliges el equipo, describes la falla y queda el folio. En el celular el botón está arriba, a la vista." }, { titulo: "Tus órdenes", texto: "En Órdenes ves las que tienes asignadas: las inicias y las cierras cuando el equipo queda liberado." }],
    operaciones: [{ titulo: "Nueva solicitud", texto: "Cuando un equipo o instalación tenga un problema, levanta una solicitud. En Seguimiento ves en qué va cada una." }],
    lector: [resumen, { titulo: "Solo consulta", texto: "Puedes ver tableros, indicadores e historial; no se pueden modificar datos con este rol." }],
  };
  return [inicio, ...(rol === "operaciones" ? [] : [pilares]), ...porRol[rol], final];
}

/** Recorrido de bienvenida: se muestra en el primer ingreso y se puede repetir con ?tour=1. */
export function Tour({ rol, empresa, nombre, visto }: { rol: Rol; empresa: string; nombre: string; visto: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const pasos = pasosDe(rol, empresa, nombre.split(" ")[0]);

  useEffect(() => {
    const pedir = new URLSearchParams(window.location.search).has("tour");
    let local = false;
    try { local = localStorage.getItem("factory-tour") === "1"; } catch { /* sin almacenamiento */ }
    if (pedir || (!visto && !local)) setAbierto(true);
  }, [visto]);

  useEffect(() => {
    if (!abierto) return;
    ref.current?.querySelector<HTMLButtonElement>("button[data-siguiente]")?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function cerrar() {
    setAbierto(false);
    try { localStorage.setItem("factory-tour", "1"); } catch { /* sin almacenamiento */ }
    const u = new URL(window.location.href);
    if (u.searchParams.has("tour")) { u.searchParams.delete("tour"); window.history.replaceState(null, "", u); }
    if (!visto) void marcarTourVisto();
  }

  if (!abierto) return null;
  const p = pasos[i];
  const ultimo = i === pasos.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="tour-tit" aria-describedby="tour-txt"
        className="w-full max-w-[440px] rounded-t-[24px] bg-panel p-6 shadow-[0_20px_60px_rgb(0_0_0/0.25)] sm:rounded-[24px]">
        <p className="text-[13px] text-suave">Paso {i + 1} de {pasos.length}</p>
        <h2 id="tour-tit" className="mt-1 text-[22px] font-semibold">{p.titulo}</h2>
        <p id="tour-txt" className="mt-2 text-[16px] leading-relaxed text-tinta">{p.texto}</p>
        <div className="mt-5 flex gap-1.5" aria-hidden="true">
          {pasos.map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-azul" : "bg-panel-2"}`} />)}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={cerrar} className="min-h-11 cursor-pointer rounded-full px-3 text-[15px] text-suave hover:text-tinta">Omitir</button>
          <div className="flex gap-2">
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="btn-sec min-h-11">Atrás</button>}
            <button type="button" data-siguiente onClick={() => (ultimo ? cerrar() : setI(i + 1))} className="btn-primario min-h-11">{ultimo ? "Empezar" : "Siguiente"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
