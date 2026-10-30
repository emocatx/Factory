"use client";

// Los 4 tipos de montacargas de la flota, modelados con primitivas.
// Convención: el frente (horquillas) apunta a +X, el ancho va en Z y el piso es y = 0.
// La carrocería lleva el color del estado; la estructura (mástil, guarda, horquillas) va en gris oscuro.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, TorusGeometry, type BufferGeometry, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { RoundedBoxGeometry } from "three-stdlib";
import type { Paleta } from "./paleta";
import { useReloj } from "./Movimiento";
import { SEP_CLASE } from "@/lib/homeComun";

type V3 = [number, number, number];
export type TipoEquipo = "contrapeso" | "reach" | "doble" | "patin";


/**
 * Tipo de un equipo. Primero su categoría (llega con el programa anual), si dice qué es; si no, el modelo.
 * Un modelo desconocido cae en contrapeso.
 */
export function tipoDeModelo(clave = ""): TipoEquipo {
  const [categoria, modelo] = clave.includes(SEP_CLASE) ? clave.split(SEP_CLASE) : ["", clave];
  const c = categoria.toLowerCase();
  if (/reach|retr[aá]ctil/.test(c)) return "reach";
  if (/doble|double|profundidad/.test(c)) return "doble";
  if (/pat[ií]n|transpaleta|pallet/.test(c)) return "patin";
  if (/contrapeso|counterbalance/.test(c)) return "contrapeso";
  const m = modelo.toUpperCase();
  if (/^(RMD|RD5|RRE|15B[PR]|N35ZDR)/.test(m)) return "doble";
  if (/^(ETR|RR5)/.test(m)) return "reach";
  if (/^(PE|EPT|ECR|WP)/.test(m)) return "patin";
  return "contrapeso";
}

// Geometrías y materiales compartidos: un equipo son ~30 piezas y una nave puede tener cien equipos;
// crearlos una sola vez evita que la escena se congele al entrar a un almacén.
const GEOS = new Map<string, BufferGeometry>();
const MATS = new Map<string, MeshStandardMaterial>();
function compartida(clave: string, crear: () => BufferGeometry) {
  let g = GEOS.get(clave);
  if (!g) { g = crear(); GEOS.set(clave, g); }
  return g;
}
const caja = (a: V3, rad = 0) => compartida(`c${a}|${rad}`, () => rad ? new RoundedBoxGeometry(a[0], a[1], a[2], 3, rad) : new BoxGeometry(...a));
const cilindro = (r: number, h: number, seg: number) => compartida(`y${r}|${h}|${seg}`, () => new CylinderGeometry(r, r, h, seg));

export function Mat({ color, r = 0.55, m = 0, glow }: { color: string; r?: number; m?: number; glow?: boolean }) {
  const clave = `${color}|${r}|${m}|${glow ? 1 : 0}`;
  let mat = MATS.get(clave);
  if (!mat) {
    mat = new MeshStandardMaterial({ color, roughness: r, metalness: m, emissive: glow ? color : "#000000", emissiveIntensity: glow ? 1.6 : 0 });
    MATS.set(clave, mat);
  }
  return <primitive object={mat} attach="material" />;
}

function Caja({ args, pos, color, r, m, rad = 0, sombra = true }: { args: V3; pos: V3; color: string; r?: number; m?: number; rad?: number; sombra?: boolean }) {
  return (
    <mesh position={pos} geometry={caja(args, rad)} castShadow={sombra} receiveShadow>
      <Mat color={color} r={r} m={m} />
    </mesh>
  );
}

function Rueda({ pos, radio = 0.2, ancho = 0.14, p }: { pos: V3; radio?: number; ancho?: number; p: Paleta }) {
  return (
    <group position={pos}>
      <mesh rotation={[Math.PI / 2, 0, 0]} geometry={cilindro(radio, ancho, 20)} castShadow>
        <Mat color={p.llanta} r={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} geometry={cilindro(radio * 0.45, ancho + 0.01, 12)}>
        <Mat color={p.rin} r={0.4} m={0.5} />
      </mesh>
    </group>
  );
}

/** Mástil de dos rieles con travesaños, placa portahorquillas y horquillas. */
function Mastil({ x, alto, p, horquilla = 0.9, ancho = 0.62, yCarro = 0.12 }: { x: number; alto: number; p: Paleta; horquilla?: number; ancho?: number; yCarro?: number }) {
  const e = p.estructura;
  return (
    <group position={[x, 0, 0]}>
      {[-ancho / 2, ancho / 2].map((z) => <Caja key={z} args={[0.09, alto, 0.09]} pos={[0, alto / 2 + 0.05, z]} color={e} r={0.35} m={0.5} />)}
      {[alto * 0.35, alto * 0.7, alto].map((y) => <Caja key={y} args={[0.07, 0.06, ancho + 0.1]} pos={[0, y, 0]} color={e} r={0.35} m={0.5} />)}
      <Caja args={[0.06, 0.38, ancho + 0.06]} pos={[0.08, yCarro + 0.2, 0]} color={e} r={0.4} m={0.4} />
      {[-0.2, 0, 0.2].map((z) => <Caja key={z} args={[0.03, 0.5, 0.03]} pos={[0.1, yCarro + 0.6, z]} color={e} r={0.4} m={0.4} sombra={false} />)}
      {[-0.2, 0.2].map((z) => <Caja key={z} args={[horquilla, 0.04, 0.09]} pos={[0.1 + horquilla / 2, yCarro, z]} color={e} r={0.3} m={0.6} />)}
    </group>
  );
}

/** Guarda superior: postes y techo con rejilla. */
function Guarda({ x0, x1, alto, ancho = 0.84, p }: { x0: number; x1: number; alto: number; ancho?: number; p: Paleta }) {
  const e = p.estructura;
  const lx = x1 - x0;
  return (
    <group>
      {[x0, x1].map((x, i) => [-ancho / 2, ancho / 2].map((z) => (
        <Caja key={`${x}${z}`} args={[0.06, alto - 1.0, 0.06]} pos={[x + (i === 1 ? -0.05 : 0), (alto + 1.0) / 2, z]} color={e} r={0.35} m={0.5} />
      )))}
      <Caja args={[lx + 0.08, 0.05, ancho + 0.06]} pos={[(x0 + x1) / 2, alto, 0]} color={e} r={0.35} m={0.5} rad={0.02} />
      {[-0.2, 0, 0.2].map((z) => <Caja key={z} args={[lx, 0.03, 0.03]} pos={[(x0 + x1) / 2, alto + 0.03, z]} color={p.estructuraClara} r={0.4} sombra={false} />)}
    </group>
  );
}

/** 2ET4000: contrapeso eléctrico de 3 ruedas. */
function Contrapeso({ c, p }: { c: string; p: Paleta }) {
  return (
    <group>
      <Caja args={[0.75, 0.75, 0.92]} pos={[-0.38, 0.58, 0]} color={c} r={0.35} rad={0.22} />
      <Caja args={[1.0, 0.42, 0.9]} pos={[0.2, 0.4, 0]} color={c} r={0.35} rad={0.12} />
      <Caja args={[0.5, 0.16, 0.86]} pos={[-0.25, 1.0, 0]} color={p.estructura} r={0.6} rad={0.05} />
      <Caja args={[0.3, 0.32, 0.44]} pos={[-0.28, 1.22, 0]} color={p.asiento} r={0.8} rad={0.08} />
      <mesh position={[0.28, 1.25, 0]} rotation={[0, 0, -0.5]} geometry={compartida("volante", () => new TorusGeometry(0.13, 0.025, 8, 20))} castShadow>
        <Mat color={p.asiento} r={0.6} />
      </mesh>
      <Caja args={[0.06, 0.4, 0.06]} pos={[0.33, 1.02, 0]} color={p.estructura} r={0.4} />
      <Guarda x0={-0.42} x1={0.5} alto={2.05} p={p} />
      <Mastil x={0.72} alto={2.2} p={p} horquilla={0.95} />
      <Rueda pos={[0.45, 0.24, 0.47]} radio={0.24} ancho={0.18} p={p} />
      <Rueda pos={[0.45, 0.24, -0.47]} radio={0.24} ancho={0.18} p={p} />
      <Rueda pos={[-0.5, 0.17, 0.08]} radio={0.17} ancho={0.12} p={p} />
      <Rueda pos={[-0.5, 0.17, -0.08]} radio={0.17} ancho={0.12} p={p} />
    </group>
  );
}

/** Patas estabilizadoras de los reach (largueros al piso con ruedita al frente). */
function Patas({ x0, largo, p, sep = 0.34 }: { x0: number; largo: number; p: Paleta; sep?: number }) {
  return (
    <group>
      {[-sep, sep].map((z) => (
        <group key={z}>
          <Caja args={[largo, 0.16, 0.14]} pos={[x0 + largo / 2, 0.1, z]} color={p.estructura} r={0.45} m={0.3} rad={0.03} />
          <Rueda pos={[x0 + largo - 0.1, 0.07, z]} radio={0.07} ancho={0.1} p={p} />
        </group>
      ))}
    </group>
  );
}

/** ETR416: reach de pie con mástil móvil. */
function ReachPie({ c, p }: { c: string; p: Paleta }) {
  return (
    <group>
      <Caja args={[0.75, 1.05, 0.9]} pos={[-0.35, 0.6, 0]} color={c} r={0.35} rad={0.12} />
      <Caja args={[0.06, 0.6, 0.44]} pos={[0.04, 0.62, 0.12]} color={p.estructuraClara} r={0.5} />
      <Caja args={[0.45, 0.08, 0.9]} pos={[-0.55, 1.15, 0]} color={p.estructura} r={0.6} />
      <Caja args={[0.05, 0.95, 0.06]} pos={[-0.72, 1.6, 0.4]} color={p.estructura} r={0.4} m={0.5} />
      <Caja args={[0.05, 0.95, 0.06]} pos={[-0.72, 1.6, -0.4]} color={p.estructura} r={0.4} m={0.5} />
      <Caja args={[1.05, 0.06, 0.9]} pos={[-0.2, 2.1, 0]} color={p.estructura} r={0.4} m={0.4} rad={0.02} />
      <Patas x0={-0.05} largo={1.25} p={p} />
      <Mastil x={0.32} alto={2.7} p={p} horquilla={0.85} ancho={0.5} yCarro={0.32} />
      <Rueda pos={[-0.45, 0.16, 0]} radio={0.16} ancho={0.14} p={p} />
    </group>
  );
}

/** RMD6095: reach de doble profundidad con pantógrafo. */
function ReachDoble({ c, p }: { c: string; p: Paleta }) {
  const e = p.estructura;
  return (
    <group>
      <Caja args={[0.8, 1.1, 0.92]} pos={[-0.4, 0.62, 0]} color={c} r={0.35} rad={0.14} />
      <Caja args={[0.05, 1.0, 0.06]} pos={[-0.78, 1.65, 0.42]} color={e} r={0.4} m={0.5} />
      <Caja args={[0.05, 1.0, 0.06]} pos={[-0.05, 1.65, 0.42]} color={e} r={0.4} m={0.5} />
      <Caja args={[0.9, 0.06, 0.9]} pos={[-0.4, 2.15, 0]} color={e} r={0.4} m={0.4} rad={0.02} />
      <Caja args={[0.34, 0.4, 0.4]} pos={[-0.55, 1.3, -0.1]} color={p.asiento} r={0.8} rad={0.06} />
      <Patas x0={0} largo={1.45} p={p} sep={0.38} />
      {[-0.27, 0.27].map((z) => <Caja key={z} args={[0.1, 3.3, 0.1]} pos={[0.12, 1.7, z]} color={e} r={0.35} m={0.5} />)}
      {[1.1, 2.2, 3.3].map((y) => <Caja key={y} args={[0.08, 0.06, 0.64]} pos={[0.12, y, 0]} color={e} r={0.35} m={0.5} />)}
      <Caja args={[0.02, 0.8, 0.06]} pos={[0.18, 2.6, 0.27]} color={c} r={0.4} sombra={false} />
      <group position={[0.2, 1.4, 0]}>
        {[-0.18, 0.18].map((z) => (
          <group key={z}>
            {[0.55, -0.55].map((rz) => (
              <mesh key={rz} position={[0.3, 0, z]} rotation={[0, 0, rz]} geometry={caja([0.72, 0.06, 0.05])} castShadow>
                <Mat color={e} r={0.35} m={0.5} />
              </mesh>
            ))}
          </group>
        ))}
        <Caja args={[0.06, 0.5, 0.62]} pos={[0.62, 0, 0]} color={e} r={0.4} m={0.4} />
        {[-0.2, 0.2].map((z) => <Caja key={z} args={[0.9, 0.04, 0.09]} pos={[1.07, -0.22, z]} color={e} r={0.3} m={0.6} />)}
      </group>
      <Rueda pos={[-0.5, 0.16, 0]} radio={0.16} ancho={0.14} p={p} />
    </group>
  );
}

/** ECR327 / PE4500: patín eléctrico con plataforma para el operador. */
function Patin({ c, p }: { c: string; p: Paleta }) {
  const e = p.estructura;
  return (
    <group>
      <Caja args={[0.62, 0.14, 0.82]} pos={[-0.55, 0.12, 0]} color={e} r={0.7} rad={0.04} />
      <Caja args={[0.62, 0.72, 0.8]} pos={[0.02, 0.5, 0]} color={c} r={0.35} rad={0.18} />
      <group position={[-0.1, 0.86, -0.18]} rotation={[0, 0, 0.35]}>
        <Caja args={[0.07, 0.7, 0.07]} pos={[0, 0.35, 0]} color={e} r={0.4} m={0.3} />
        <Caja args={[0.08, 0.1, 0.34]} pos={[0, 0.72, 0]} color={e} r={0.5} rad={0.03} />
      </group>
      <Caja args={[0.05, 0.75, 0.05]} pos={[-0.84, 0.55, 0.36]} color={e} r={0.4} m={0.4} />
      <Caja args={[0.05, 0.75, 0.05]} pos={[-0.84, 0.55, -0.36]} color={e} r={0.4} m={0.4} />
      <Caja args={[0.05, 0.05, 0.76]} pos={[-0.84, 0.92, 0]} color={e} r={0.4} m={0.4} />
      {[-0.28, -0.1, 0.1, 0.28].map((z) => <Caja key={z} args={[0.04, 0.9, 0.04]} pos={[0.38, 0.55, z]} color={e} r={0.4} m={0.4} sombra={false} />)}
      <Caja args={[0.05, 0.05, 0.64]} pos={[0.38, 1.0, 0]} color={e} r={0.4} m={0.4} />
      {[-0.2, 0.2].map((z) => <Caja key={z} args={[1.35, 0.08, 0.17]} pos={[1.08, 0.07, z]} color={e} r={0.35} m={0.5} />)}
      <Rueda pos={[0, 0.13, 0.32]} radio={0.13} ancho={0.1} p={p} />
      <Rueda pos={[0, 0.13, -0.32]} radio={0.13} ancho={0.1} p={p} />
    </group>
  );
}

const MODELOS = { contrapeso: Contrapeso, reach: ReachPie, doble: ReachDoble, patin: Patin };

/**
 * Un equipo en la escena. `estado`: normal | paro | renta.
 * Torreta verde si opera, roja si está en taller; los de taller llevan además un anillo que pulsa
 * (el estado no depende solo del color).
 */
/** Versión de 3 piezas (carrocería, mástil, torreta) para la vista general con muchos almacenes. */
function Ficha({ c, p, tipo }: { c: string; p: Paleta; tipo: TipoEquipo }) {
  const alto = tipo === "patin" ? 0.75 : 1.1;
  return (
    <group>
      <mesh position={[-0.2, alto / 2 + 0.1, 0]} geometry={caja([1.1, alto, 0.9])} castShadow>
        <Mat color={c} r={0.4} />
      </mesh>
      <mesh position={[0.45, tipo === "patin" ? 0.55 : 1.2, 0]} geometry={caja([0.12, tipo === "patin" ? 1.0 : 2.3, 0.6])}>
        <Mat color={p.estructura} r={0.4} />
      </mesh>
    </group>
  );
}

export function Equipo({ tipo, estado = "normal", p, posicion: pos, rot = 0, moviendo = false, recorrido = 1.1, escala = 0.55, simple = false }: {
  tipo: TipoEquipo; estado?: "normal" | "paro" | "renta"; p: Paleta; posicion: V3; rot?: number; moviendo?: boolean; escala?: number;
  /** Cuánto se desplaza de ida y vuelta un equipo que opera. */
  recorrido?: number;
  /** Vista general: el equipo como ficha simple (mismo color de estado), para que la escena siga fluida. */
  simple?: boolean;
}) {
  const ref = useRef<Group>(null);
  const anillo = useRef<Mesh>(null);
  const fase = useMemo(() => (pos[0] * 7.3 + pos[2] * 3.1) % (Math.PI * 2), [pos]);
  const color = estado === "paro" ? p.paro : estado === "renta" ? p.renta : p.cuerpo;
  const Modelo = MODELOS[tipo] ?? Contrapeso;
  const reloj = useReloj();
  // solo se mueve mientras la escena está animando (ver Movimiento.tsx); en reposo se queda donde iba
  useFrame(() => {
    if (p.quieto || !reloj.vivo) return;
    const t = reloj.t;
    if (moviendo && ref.current) ref.current.position.x = pos[0] + Math.sin(t * 0.5 + fase) * recorrido;
    if (estado === "paro" && anillo.current) {
      const k = (t * 0.8 + fase) % 1;
      anillo.current.scale.setScalar(1 + k * 0.9);
      (anillo.current.material as MeshBasicMaterial).opacity = 0.6 * (1 - k);
    }
  });
  return (
    <group ref={ref} position={pos} rotation={[0, rot, 0]} scale={escala}>
      {simple ? <Ficha c={color} p={p} tipo={tipo} /> : <Modelo c={color} p={p} />}
      <mesh position={[-0.35, tipo === "patin" ? 1.1 : 2.3, 0]} geometry={compartida("torreta", () => new SphereGeometry(0.1, 12, 12))}>
        <Mat color={estado === "paro" ? p.paro : p.torretaOk} glow />
      </mesh>
      {estado === "paro" && (
        <mesh ref={anillo} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.0, 1.18, 40]} />
          <meshBasicMaterial color={p.paro} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
