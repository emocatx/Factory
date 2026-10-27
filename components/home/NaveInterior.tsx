"use client";

// Nave vista por dentro (corte tipo casa de muñecas), basada en fotos reales de CAB.
// Dos zonas que se distinguen a simple vista:
//  · OPERACIÓN (al fondo): racks selectivos azul/naranja y los equipos trabajando, con torreta verde.
//  · TALLER (al frente, hacia la cámara): piso propio con franjas de seguridad, cajones, banco y
//    cargadores; ahí se estacionan los equipos en taller, con torreta roja y piso iluminado.
import { useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import { Instance, Instances, RoundedBox } from "@react-three/drei";
import { Equipo, Mat, tipoDeModelo } from "./Equipos3D";
import type { Paleta } from "./paleta";

type V3 = [number, number, number];
export type NaveEscena = { id: string; nombre: string; total: number; paro: number; detenidos: string[]; operando: [string, boolean][] };

const ALTO = 2.8;
// racks de dos niveles: bajos para que se vean los equipos que trabajan en los pasillos
const RACK = { ancho: 1.3, fondo: 0.9, niveles: [0, 0.8], alto: 1.5 };
/** Ancho de un cajón de taller y separación entre equipos en un pasillo. */
const PASO_T = 1.14, PASO_OP = 1.6;
/** Fondo de cada módulo de operación (rack + pasillo) y de cada fila de cajones del taller. */
const MOD_OP = 2.5, FILA_T = 2.1;

/**
 * Acomodo de la nave según sus equipos: el ancho crece con los cajones de taller, la zona de
 * operación suma pasillos (con su rack) hasta que caben todos los que operan y el taller suma filas.
 */
export function trazo(n: NaveEscena) {
  const nT = n.detenidos.length, nOp = n.operando.length;
  const colsT = Math.min(16, Math.max(9, nT));
  const filasT = Math.max(1, Math.ceil(nT / colsT));
  const ancho = Math.max(10.6, colsT * PASO_T + 0.6);
  const porPasillo = Math.max(1, Math.floor((ancho - 1.2) / PASO_OP));
  const pasillos = Math.max(2, Math.ceil(nOp / porPasillo));
  const fondoOp = pasillos * MOD_OP + 0.3;
  const fondoT = 0.55 + filasT * FILA_T + 1.25;
  const largo = fondoOp + 0.6 + fondoT;
  const nAtras = -largo / 2;
  const nFrente = nAtras + fondoOp;
  const tAtras = nFrente + 0.6;
  return { colsT, filasT, ancho, porPasillo, pasillos, nAtras, nFrente, tAtras, tFrente: tAtras + fondoT, x0: -ancho / 2, x1: ancho / 2 };
}
type Trazo = ReturnType<typeof trazo>;

/** Medidas del piso de la nave (para encuadrarla). */
export function medidas(n: NaveEscena) {
  const t = trazo(n);
  return { ancho: t.ancho + 0.8, fondo: t.tFrente - t.nAtras + 0.6 };
}

const zRack = (t: Trazo, k: number) => t.nAtras + 0.65 + k * MOD_OP;
const zPasillo = (t: Trazo, k: number) => zRack(t, k) + 1.35;

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

/** Una fila de racks por pasillo, con carga solo en los niveles bajos (nada apilado arriba). */
function Racks({ p, semilla, t }: { p: Paleta; semilla: number; t: Trazo }) {
  const d = useMemo(() => {
    const postes: V3[] = [], vigas: V3[] = [], tarimas: V3[] = [], cajas: V3[] = [], emplayadas: V3[] = [];
    const bahias = Math.floor((t.ancho - 1.5) / RACK.ancho);
    const x0 = (-bahias * RACK.ancho) / 2;
    for (let f = 0; f < t.pasillos; f++) {
      const z = zRack(t, f);
      for (let b = 0; b <= bahias; b++) {
        const x = x0 + b * RACK.ancho;
        postes.push([x, RACK.alto / 2, z - RACK.fondo / 2], [x, RACK.alto / 2, z + RACK.fondo / 2]);
      }
      for (let b = 0; b < bahias; b++) {
        const cx = x0 + (b + 0.5) * RACK.ancho;
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
    }
    return { postes, vigas, tarimas, cajas, emplayadas };
  }, [semilla, t]);
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

function Operacion({ nave, p, i, t, simple }: { nave: NaveEscena; p: Paleta; i: number; t: Trazo; simple: boolean }) {
  const zc = (t.nAtras + t.nFrente) / 2;
  const fondo = t.nFrente - t.nAtras;
  // los que operan, repartidos por pasillo; se mueven poco para no chocar entre sí
  const xIni = (-(t.porPasillo - 1) * PASO_OP) / 2;
  return (
    <group>
      <mesh position={[0, 0.02, zc]} receiveShadow>
        <boxGeometry args={[t.ancho, 0.04, fondo]} />
        <Mat color={p.pisoNave} r={0.3} m={0.05} />
      </mesh>
      {Array.from({ length: t.pasillos }, (_, k) => (
        <group key={k}>
          <Plano x={0} z={zPasillo(t, k) - 0.55} w={t.ancho - 0.6} d={0.05} color={p.amarillo} />
          <Plano x={0} z={zPasillo(t, k)} w={t.ancho - 1.2} d={0.5} color={p.ok} brillo opacidad={0.1} />
        </group>
      ))}
      <Muro x={0} z={t.nAtras - 0.1} w={t.ancho + 0.2} d={0.2} alto={ALTO} p={p} />
      <Muro x={t.x0 - 0.1} z={zc} w={0.2} d={fondo} alto={ALTO} p={p} />
      <Muro x={t.x1 + 0.1} z={zc} w={0.2} d={fondo} alto={0.4} p={p} />
      <Racks p={p} semilla={i + 1} t={t} />
      <Rotulo texto={`OPERACIÓN · ${nave.total - nave.paro}`} fondo={p.rotuloOk} p={p} posicion={[-t.ancho * 0.3, 2.55, t.nAtras + 0.05]} ancho={2.4} />
      {nave.operando.map(([modelo, renta], k) => (
        <Equipo key={k} p={p} tipo={tipoDeModelo(modelo)} estado={renta ? "renta" : "normal"} moviendo recorrido={0.25} simple={simple}
          posicion={[xIni + (k % t.porPasillo) * PASO_OP, 0.04, zPasillo(t, Math.floor(k / t.porPasillo))]} rot={k % 2 ? Math.PI : 0} />
      ))}
    </group>
  );
}

function Taller({ nave, p, t }: { nave: NaveEscena; p: Paleta; t: Trazo }) {
  const fondo = t.tFrente - t.tAtras;
  const tF = useFranjas(p, t.ancho * 2.5);
  const tL = useFranjas(p, fondo * 2.5);
  const w = (t.ancho - 0.6) / t.colsT;
  const xIni = t.x0 + 0.3;
  const cx = (k: number) => xIni + ((k % t.colsT) + 0.5) * w;
  const zBoca = (fila: number) => t.tAtras + 0.55 + fila * FILA_T;
  const zCajon = (k: number) => zBoca(Math.floor(k / t.colsT)) + 1.0;
  const zBanco = t.tFrente - 0.45;
  const zc = (t.tAtras + t.tFrente) / 2;
  const enTaller = nave.detenidos;
  const puerta = t.ancho / 2 - 0.6;
  return (
    <group>
      <mesh position={[0, 0.03, zc]} receiveShadow>
        <boxGeometry args={[t.ancho, 0.06, fondo]} />
        <Mat color={p.pisoTaller} r={0.55} />
      </mesh>
      <Plano x={0} z={t.tAtras + 0.1} w={t.ancho} d={0.2} color="#ffffff" y={0.065} mapa={tF} />
      <Plano x={0} z={t.tFrente - 0.1} w={t.ancho} d={0.2} color="#ffffff" y={0.065} mapa={tF} />
      {[t.x0 + 0.1, t.x1 - 0.1].map((x) => (
        <mesh key={x} position={[x, 0.065, zc]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[fondo, 0.2]} />
          <meshStandardMaterial map={tL} roughness={0.5} />
        </mesh>
      ))}
      <Muro x={t.x0 - 0.1} z={zc} w={0.2} d={fondo} alto={0.4} p={p} />
      <Muro x={t.x1 + 0.1} z={zc} w={0.2} d={fondo} alto={0.4} p={p} />
      <Muro x={-(puerta / 2 + 0.6)} z={t.tFrente + 0.1} w={puerta} d={0.2} alto={0.4} p={p} />
      <Muro x={puerta / 2 + 0.6} z={t.tFrente + 0.1} w={puerta} d={0.2} alto={0.4} p={p} />
      {Array.from({ length: t.filasT }, (_, f) => (
        <group key={f}>
          {Array.from({ length: t.colsT + 1 }, (_, k) => (
            <Plano key={k} x={xIni + k * w} z={zBoca(f) + 1.0} w={0.05} d={2.0} color={p.amarillo} y={0.07} />
          ))}
        </group>
      ))}
      {enTaller.map((_, k) => (
        <Plano key={`o${k}`} x={cx(k)} z={zCajon(k)} w={w - 0.12} d={1.9} color={p.paro} y={0.072} brillo opacidad={0.14} />
      ))}
      <Lote items={[[-t.ancho / 4, 0.42, zBanco], [t.ancho / 4, 0.42, zBanco]]} args={[t.ancho / 2 - 1.1, 0.08, 0.55]} color={p.banco} r={0.5} m={0.2} />
      <Lote items={[[t.x0 + 0.9, 0.35, zBanco - 0.05], [t.x1 - 0.9, 0.35, zBanco - 0.05]]} args={[0.6, 0.7, 0.5]} color={p.gabinete} r={0.35} m={0.3} />
      <Lote items={Array.from({ length: t.colsT }, (_, k) => [cx(k), 0.66, zBanco + 0.12] as V3)} args={[0.34, 0.4, 0.16]} color={p.cargador} r={0.45} m={0.2} />
      {Array.from({ length: t.colsT }, (_, k) => (
        <mesh key={`s${k}`} position={[cx(k), 0.72, zBanco + 0.035]}>
          <boxGeometry args={[0.22, 0.12, 0.01]} />
          <Mat color={k < enTaller.length ? p.paro : p.pantalla} glow />
        </mesh>
      ))}
      {enTaller.map((modelo, k) => (
        <Equipo key={k} p={p} tipo={tipoDeModelo(modelo)} estado="paro" posicion={[cx(k), 0.06, zCajon(k) + 0.15]} rot={Math.PI / 2} />
      ))}
      <Rotulo texto={`MANTTO · ${nave.paro}`} fondo={p.rotuloParo} p={p} posicion={[0, 1.55, t.tAtras + 0.05]} ancho={2.2} />
    </group>
  );
}

/** Nave elegida, vista por dentro y del tamaño que pidan sus equipos (todos, con su modelo completo). */
export function NaveInterior({ nave, i, p, onTaller }: { nave: NaveEscena; i: number; p: Paleta; onTaller: (id: string) => void }) {
  const t = useMemo(() => trazo(nave), [nave]);
  const { ancho, fondo } = medidas(nave);
  // con flotas muy grandes los que operan van como fichas para que la escena siga fluida
  const simple = nave.operando.length + nave.detenidos.length > 70;
  return (
    <group>
      <RoundedBox args={[ancho, 0.3, fondo]} radius={0.14} smoothness={4} position={[0, -0.15, (t.nAtras + t.tFrente) / 2]} receiveShadow>
        <Mat color={p.piso} r={0.95} />
      </RoundedBox>
      <Operacion nave={nave} p={p} i={i} t={t} simple={simple} />
      <Plano x={0} z={(t.nFrente + t.tAtras) / 2} w={t.ancho} d={t.tAtras - t.nFrente} color={p.pisoNave} y={0.03} />
      {/* clic en el taller: abre la lista de equipos en taller de esta nave */}
      <group onClick={(e) => { e.stopPropagation(); onTaller(nave.id); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <Taller nave={nave} p={p} t={t} />
      </group>
    </group>
  );
}
