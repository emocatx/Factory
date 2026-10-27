"use client";

// Nave vista por dentro (corte tipo casa de muñecas), basada en fotos reales de CAB.
// Dos zonas que se distinguen a simple vista:
//  · OPERACIÓN (al fondo): racks selectivos azul/naranja y los equipos trabajando, con torreta verde.
//  · TALLER (al frente, hacia la cámara): piso propio con franjas de seguridad, cajones, banco y
//    cargadores; ahí se estacionan los equipos en taller, con torreta roja y piso iluminado.
import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Group, type Texture } from "three";
import { Instance, Instances, RoundedBox } from "@react-three/drei";
import { Equipo, Mat, tipoDeModelo } from "./Equipos3D";
import type { Paleta } from "./paleta";

type V3 = [number, number, number];
export type NaveEscena = { id: string; nombre: string; total: number; paro: number; detenidos: string[]; operando: [string, boolean][] };

const ANCHO = 10.6;
const X0 = -ANCHO / 2, X1 = ANCHO / 2;
const N_ATRAS = -4.9, N_FRENTE = 0.4;
const T_ATRAS = 1.0, T_FRENTE = 4.9;
const ALTO = 2.8;
const RACK = { filas: [-4.25, -2.6], x0: -4.55, bahias: 7, ancho: 1.3, fondo: 0.9, niveles: [0, 0.85, 1.6], alto: 2.25 };
const CAJONES = 9;

/** Pseudoaleatorio estable: el acomodo de tarimas no cambia entre renders. */
function azar(...n: number[]) {
  const x = Math.sin(n.reduce((a, b, i) => a + b * (12.9898 + i * 78.233), 0)) * 43758.5453;
  return x - Math.floor(x);
}

function Lote({ items, args, color, r = 0.6, m = 0, sombra = true }: { items: V3[]; args: V3; color: string; r?: number; m?: number; sombra?: boolean }) {
  if (!items.length) return null;
  return (
    <Instances limit={items.length} castShadow={sombra} receiveShadow>
      <boxGeometry args={args} />
      <Mat color={color} r={r} m={m} />
      {items.map((q, k) => <Instance key={k} position={q} />)}
    </Instances>
  );
}

function Plano({ x, z, w, d, color, y = 0.045, opacidad = 1, mapa, brillo }: { x: number; z: number; w: number; d: number; color: string; y?: number; opacidad?: number; mapa?: Texture; brillo?: boolean }) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      {brillo
        ? <meshBasicMaterial color={color} transparent opacity={opacidad} toneMapped={false} depthWrite={false} />
        : <meshStandardMaterial color={color} map={mapa} roughness={0.5} transparent={opacidad < 1} opacity={opacidad} />}
    </mesh>
  );
}

/** Racks con carga solo en los niveles bajos (nada apilado arriba). */
function Racks({ p, semilla }: { p: Paleta; semilla: number }) {
  const d = useMemo(() => {
    const postes: V3[] = [], vigas: V3[] = [], tarimas: V3[] = [], cajas: V3[] = [], emplayadas: V3[] = [];
    RACK.filas.forEach((z, f) => {
      for (let b = 0; b <= RACK.bahias; b++) {
        const x = RACK.x0 + b * RACK.ancho;
        postes.push([x, RACK.alto / 2, z - RACK.fondo / 2], [x, RACK.alto / 2, z + RACK.fondo / 2]);
      }
      for (let b = 0; b < RACK.bahias; b++) {
        const cx = RACK.x0 + (b + 0.5) * RACK.ancho;
        RACK.niveles.forEach((y, n) => {
          if (n > 0) vigas.push([cx, y - 0.05, z - RACK.fondo / 2], [cx, y - 0.05, z + RACK.fondo / 2]);
          [-0.3, 0.3].forEach((dx, k) => {
            const h = azar(semilla, f, b, n, k);
            if (h < 0.18) return;
            tarimas.push([cx + dx, y + 0.05, z]);
            (h < 0.45 ? emplayadas : cajas).push([cx + dx, y + 0.36, z]);
          });
        });
      }
    });
    return { postes, vigas, tarimas, cajas, emplayadas };
  }, [semilla]);
  return (
    <group>
      <Lote items={d.postes} args={[0.08, RACK.alto, 0.08]} color={p.poste} r={0.4} m={0.3} />
      <Lote items={d.vigas} args={[RACK.ancho - 0.08, 0.1, 0.06]} color={p.viga} r={0.4} m={0.2} />
      <Lote items={d.tarimas} args={[0.52, 0.1, 0.8]} color={p.madera} r={0.9} />
      <Lote items={d.cajas} args={[0.5, 0.52, 0.74]} color={p.carton} r={0.75} />
      <Lote items={d.emplayadas} args={[0.5, 0.52, 0.74]} color={p.emplaye} r={0.25} m={0.05} />
    </group>
  );
}

function useTexturaTexto(texto: string, fondo: string) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = fondo;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#ffffff";
    g.font = "600 60px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(texto, 256, 68);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [texto, fondo]);
}

/** Franjas de seguridad amarillo/negro para delimitar el taller. */
function useFranjas(p: Paleta, repetir: number) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 16;
    const g = c.getContext("2d")!;
    g.fillStyle = p.amarillo;
    g.fillRect(0, 0, 64, 16);
    g.fillStyle = p.franjaOscura;
    for (let x = -16; x < 80; x += 16) {
      g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 8, 16); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.fill();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.repeat.set(repetir, 1);
    return t;
  }, [p.amarillo, p.franjaOscura, repetir]);
}

function Rotulo({ texto, fondo, p, posicion: pos, ancho = 2.2, alto = 0.55 }: { texto: string; fondo: string; p: Paleta; posicion: V3; ancho?: number; alto?: number }) {
  const tex = useTexturaTexto(texto, fondo);
  return (
    <group position={pos}>
      {[-ancho / 2 + 0.1, ancho / 2 - 0.1].map((x) => (
        <mesh key={x} position={[x, -0.6, 0]} castShadow>
          <boxGeometry args={[0.05, 1.2, 0.05]} />
          <Mat color={p.estructuraClara} r={0.5} m={0.3} />
        </mesh>
      ))}
      <mesh castShadow>
        <boxGeometry args={[ancho, alto, 0.06]} />
        <meshStandardMaterial map={tex} roughness={0.4} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={p.oscuro ? 0.85 : 0.15} />
      </mesh>
    </group>
  );
}

function Muro({ x, z, w, d, alto, p }: { x: number; z: number; w: number; d: number; alto: number; p: Paleta }) {
  return (
    <group>
      <mesh position={[x, alto / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[w, alto, d]} />
        <Mat color={p.muro} r={0.7} />
      </mesh>
      <mesh position={[x, Math.min(0.8, alto) / 2, z]}>
        <boxGeometry args={[w + 0.01, Math.min(0.8, alto), d + 0.01]} />
        <Mat color={p.banda} r={0.6} />
      </mesh>
    </group>
  );
}

function Operacion({ nave, p, i, ligera, simple }: { nave: NaveEscena; p: Paleta; i: number; ligera: boolean; simple: boolean }) {
  const zc = (N_ATRAS + N_FRENTE) / 2;
  return (
    <group>
      <mesh position={[0, 0.02, zc]} receiveShadow>
        <boxGeometry args={[ANCHO, 0.04, N_FRENTE - N_ATRAS]} />
        <Mat color={p.pisoNave} r={0.3} m={0.05} />
      </mesh>
      <Plano x={0} z={-3.42} w={ANCHO - 0.6} d={0.05} color={p.amarillo} />
      <Plano x={0} z={-2.1} w={ANCHO - 0.6} d={0.05} color={p.amarillo} />
      <Plano x={0} z={-0.95} w={ANCHO - 1.2} d={0.5} color={p.ok} brillo opacidad={0.1} />
      <Muro x={0} z={N_ATRAS - 0.1} w={ANCHO + 0.2} d={0.2} alto={ALTO} p={p} />
      <Muro x={X0 - 0.1} z={zc} w={0.2} d={N_FRENTE - N_ATRAS} alto={ALTO} p={p} />
      <Muro x={X1 + 0.1} z={zc} w={0.2} d={N_FRENTE - N_ATRAS} alto={0.4} p={p} />
      <Racks p={p} semilla={i + 1} />
      <Rotulo texto={`OPERACIÓN · ${nave.total - nave.paro}`} fondo={p.rotuloOk} p={p} posicion={[-3.2, 2.55, N_ATRAS + 0.05]} ancho={2.4} />
      {/* en la versión ligera no se dibujan los equipos que operan (son los que más pesan) */}
      {!ligera && nave.operando.map(([modelo, renta], k) => (
        <Equipo key={k} p={p} tipo={tipoDeModelo(modelo)} estado={renta ? "renta" : "normal"} moviendo simple={simple}
          posicion={[[-2.6, 2.0, -0.4, 3.4][k], 0.04, [-0.95, -0.95, -3.42, -3.42][k]]} rot={k % 2 ? Math.PI : 0} />
      ))}
    </group>
  );
}

function Taller({ nave, p, simple }: { nave: NaveEscena; p: Paleta; simple: boolean }) {
  const fondo = T_FRENTE - T_ATRAS;
  const tF = useFranjas(p, ANCHO * 2.5);
  const tL = useFranjas(p, fondo * 2.5);
  const w = (ANCHO - 0.6) / CAJONES;
  const x0 = X0 + 0.3;
  const cx = (k: number) => x0 + (k + 0.5) * w;
  const zBoca = T_ATRAS + 0.55, zFondo = zBoca + 2.0;
  const zBanco = T_FRENTE - 0.45;
  const zc = (T_ATRAS + T_FRENTE) / 2;
  const enTaller = nave.detenidos.slice(0, CAJONES);
  return (
    <group>
      <mesh position={[0, 0.03, zc]} receiveShadow>
        <boxGeometry args={[ANCHO, 0.06, fondo]} />
        <Mat color={p.pisoTaller} r={0.55} />
      </mesh>
      <Plano x={0} z={T_ATRAS + 0.1} w={ANCHO} d={0.2} color="#ffffff" y={0.065} mapa={tF} />
      <Plano x={0} z={T_FRENTE - 0.1} w={ANCHO} d={0.2} color="#ffffff" y={0.065} mapa={tF} />
      {[X0 + 0.1, X1 - 0.1].map((x) => (
        <mesh key={x} position={[x, 0.065, zc]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[fondo, 0.2]} />
          <meshStandardMaterial map={tL} roughness={0.5} />
        </mesh>
      ))}
      <Muro x={X0 - 0.1} z={zc} w={0.2} d={fondo} alto={0.4} p={p} />
      <Muro x={X1 + 0.1} z={zc} w={0.2} d={fondo} alto={0.4} p={p} />
      <Muro x={-3.0} z={T_FRENTE + 0.1} w={4.8} d={0.2} alto={0.4} p={p} />
      <Muro x={3.0} z={T_FRENTE + 0.1} w={4.8} d={0.2} alto={0.4} p={p} />
      {Array.from({ length: CAJONES + 1 }, (_, k) => (
        <Plano key={`l${k}`} x={x0 + k * w} z={(zBoca + zFondo) / 2} w={0.05} d={zFondo - zBoca} color={p.amarillo} y={0.07} />
      ))}
      {enTaller.map((_, k) => (
        <Plano key={`o${k}`} x={cx(k)} z={(zBoca + zFondo) / 2} w={w - 0.12} d={zFondo - zBoca - 0.1} color={p.paro} y={0.072} brillo opacidad={0.14} />
      ))}
      <Lote items={[[-2.6, 0.42, zBanco], [2.6, 0.42, zBanco]]} args={[4.2, 0.08, 0.55]} color={p.banco} r={0.5} m={0.2} />
      <Lote items={[-4.4, -0.8, 0.8, 4.4].map((x) => [x, 0.2, zBanco] as V3)} args={[0.06, 0.4, 0.5]} color={p.estructuraClara} r={0.5} />
      <Lote items={[[-4.0, 0.35, zBanco - 0.05], [4.1, 0.35, zBanco - 0.05]]} args={[0.6, 0.7, 0.5]} color={p.gabinete} r={0.35} m={0.3} />
      <Lote items={Array.from({ length: CAJONES }, (_, k) => [cx(k), 0.66, zBanco + 0.12] as V3)} args={[0.34, 0.4, 0.16]} color={p.cargador} r={0.45} m={0.2} />
      {Array.from({ length: CAJONES }, (_, k) => (
        <mesh key={`s${k}`} position={[cx(k), 0.72, zBanco + 0.035]}>
          <boxGeometry args={[0.22, 0.12, 0.01]} />
          <Mat color={k < enTaller.length ? p.paro : p.pantalla} glow />
        </mesh>
      ))}
      {enTaller.map((modelo, k) => (
        <Equipo key={k} p={p} tipo={tipoDeModelo(modelo)} estado="paro" simple={simple} posicion={[cx(k), 0.06, (zBoca + zFondo) / 2 + 0.15]} rot={Math.PI / 2} />
      ))}
      <Rotulo texto={`TALLER · ${nave.paro}`} fondo={p.rotuloParo} p={p} posicion={[0, 1.55, T_ATRAS + 0.05]} ancho={2.2} />
    </group>
  );
}

export function NaveInterior({ nave, i, p, seleccionada, onSelect, onTaller, ligera = false, simple = false }: {
  nave: NaveEscena; i: number; p: Paleta; seleccionada: boolean; onSelect: (id: string) => void; onTaller: (id: string) => void;
  /** Versión liviana para los almacenes sin equipos en taller cuando hay muchos en la escena. */
  ligera?: boolean;
  /** Equipos como fichas simples (vista general con muchos almacenes). */
  simple?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const activo = hover || seleccionada;
  const grupo = useRef<Group>(null);
  useFrame(() => {
    if (!grupo.current) return;
    const y = activo ? 0.15 : 0;
    grupo.current.position.y += (y - grupo.current.position.y) * 0.15;
  });
  return (
    <group>
      <RoundedBox args={[11.4, 0.3, 10.4]} radius={0.14} smoothness={4} position={[0, -0.15, 0]} receiveShadow>
        <Mat color={seleccionada ? p.selSuave : p.piso} r={0.95} />
      </RoundedBox>
      <group
        ref={grupo}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        onClick={(e) => { e.stopPropagation(); onSelect(nave.id); }}
      >
        <Operacion nave={nave} p={p} i={i} ligera={ligera} simple={simple} />
        <Plano x={0} z={(N_FRENTE + T_ATRAS) / 2} w={ANCHO} d={T_ATRAS - N_FRENTE} color={p.pisoNave} y={0.03} />
        {/* clic en el taller: abre la lista de equipos en taller de esta nave */}
        <group onClick={(e) => { e.stopPropagation(); onTaller(nave.id); }}>
          <Taller nave={nave} p={p} simple={simple} />
        </group>
        {activo && (
          <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[7.2, 7.35, 4, 1, Math.PI / 4]} />
            <meshBasicMaterial color={p.sel} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
