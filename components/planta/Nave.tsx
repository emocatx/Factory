"use client";

// Nave de un almacén armada desde su ficha (ver ficha.ts), en metros. La usan el prototipo (/prueba-planta) y el
// Resumen de Móviles cuando el almacén tiene ficha: un solo motor para los dos.
// Estructura (piso, muros, racks, andenes, zonas) siempre presente como contexto; los activos llevan color de
// estado solo si son del pilar que se ve y hay dato; lo demás queda en un gris neutro.
// Rendimiento: lo repetido (racks, andenes, cargadores, tráileres) es geometría instanciada y la flota también:
// cada pieza de cada tipo de equipo es una sola llamada de dibujo para todos los equipos de ese tipo.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BoxGeometry, CanvasTexture, Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace, Vector3, type BufferGeometry, type InstancedMesh, type Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Mat, type TipoEquipo } from "@/components/home/Equipos3D";
import { useReloj } from "@/components/home/Movimiento";
import type { Paleta } from "@/components/home/paleta";
import { PILAR_DE, pose, type Activo, type Categoria, type Distribucion, type Estado, type Montacargas, type Pilar } from "./ficha";

type V3 = [number, number, number];
export type Vista = Pilar | "todos";

const ALTO_MURO = 3;
const ALTO_RACK = 4.5;
const ANCHO_RACK = 2.4;
/** Tamaño de los montacargas respecto a sus piezas (las piezas miden como los modelos de Equipos3D). */
const ESCALA_EQUIPO = 1.25;

function neutros(p: Paleta) {
  return p.oscuro
    ? { piso: "#1d2124", objeto: "#353c40", rack: "#2c3236" }
    : { piso: "#e3e5e9", objeto: "#c3c7ce", rack: "#cfd2d8" };
}

const TONOS = {
  claro: { embarque: "#dbe6f7", recepcion: "#f6ead2", taller: "#f6e3dc", carga: "#e3f1e7", oficina: "#ffffff", patio: "#d9dbe0", tarimas: "#efe4d2", neutro: "#e9eaee" },
  oscuro: { embarque: "#1a2433", recepcion: "#2c2618", taller: "#2e1f1d", carga: "#16261d", oficina: "#262b2f", patio: "#141719", tarimas: "#29241b", neutro: "#22272a" },
};

/** Qué pilar resalta cada tono de piso (los demás quedan neutros fuera de su vista). */
const PILAR_TONO: Partial<Record<keyof typeof TONOS.claro, Pilar>> = { taller: "moviles", carga: "moviles", oficina: "inmuebles", embarque: "inmuebles", recepcion: "inmuebles", tarimas: "inmuebles" };

// ── Texturas dibujadas en canvas (una vez por tema) ───────────────────────────────────────────────
function useTexturaRack(p: Paleta) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 170;
    const g = c.getContext("2d")!;
    g.fillStyle = p.oscuro ? "#1b1f22" : "#eef0f3"; g.fillRect(0, 0, 512, 170);
    const bahia = 512 / 5;
    for (let b = 0; b < 5; b++) {
      for (let n = 0; n < 3; n++) {
        const y = 170 - (n + 1) * 54;
        for (let k = 0; k < 2; k++) {
          const x = b * bahia + 8 + k * (bahia / 2);
          const h = Math.abs(Math.sin((b * 3 + n * 7 + k) * 12.9898) * 43758.5453) % 1;
          if (h < 0.15) continue;
          g.fillStyle = h < 0.45 ? p.emplaye : p.carton;
          g.fillRect(x, y + 6, bahia / 2 - 14, 40);
          g.fillStyle = p.madera; g.fillRect(x - 2, y + 46, bahia / 2 - 10, 6);
        }
        g.fillStyle = p.viga; g.fillRect(b * bahia, 170 - n * 54 - 4, bahia, 5);
      }
      g.fillStyle = p.poste; g.fillRect(b * bahia, 0, 7, 170);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace; t.wrapS = RepeatWrapping; t.anisotropy = 4;
    return t;
  }, [p.oscuro, p.emplaye, p.carton, p.madera, p.viga, p.poste]);
}

function useTexturaTexto(texto: string, color: string, fondo?: string) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const f = "600 56px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
    g.font = f;
    const w = Math.ceil(g.measureText(texto).width) + 48;
    c.width = w; c.height = 96;
    if (fondo) { g.fillStyle = fondo; g.beginPath(); g.roundRect(0, 0, w, 96, 48); g.fill(); }
    g.font = f; g.fillStyle = color; g.textBaseline = "middle"; g.textAlign = "center";
    g.fillText(texto, w / 2, 50);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
    return { t, aspecto: w / 96 };
  }, [texto, color, fondo]);
}

// Las texturas de canvas se liberan al desmontar (al salir del almacén o cambiar de tema).
function useLiberar(t: { dispose: () => void }) {
  useEffect(() => () => t.dispose(), [t]);
}

// ── Piezas ────────────────────────────────────────────────────────────────────────────────────────
function Etiqueta({ texto, x, z, y = 0.08, p, alto = 2.6 }: { texto: string; x: number; z: number; y?: number; p: Paleta; alto?: number }) {
  const { t, aspecto } = useTexturaTexto(texto, p.oscuro ? "#e8ecea" : "#3a3a3c");
  useLiberar(t);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[alto * aspecto, alto]} />
      <meshBasicMaterial map={t} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

type Item = { pos: V3; color?: string; rot?: number; escala?: V3 };
/**
 * Malla instanciada que se llena una vez al montar (sin un componente de React por pieza: con 57 andenes y 36
 * racks eso eran cientos de componentes y hacía lento entrar al almacén).
 */
function useInstancias(items: Item[], glow?: boolean) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const malla = ref.current;
    if (!malla) return;
    items.forEach((it, k) => {
      _o.position.set(...it.pos); _o.rotation.set(0, it.rot ?? 0, 0); _o.scale.set(...(it.escala ?? [1, 1, 1])); _o.updateMatrix();
      malla.setMatrixAt(k, _o.matrix);
      malla.setColorAt(k, _c.set(it.color ?? "#ffffff").multiplyScalar(glow ? 2.2 : 1));
    });
    malla.instanceMatrix.needsUpdate = true;
    if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
    malla.computeBoundingSphere();
  }, [items, glow]);
  return ref;
}

/** Instancias con color por instancia (estado). */
function Lote({ items, args, r = 0.55, m = 0, sombra = true, glow }: { items: Item[]; args: V3; r?: number; m?: number; sombra?: boolean; glow?: boolean }) {
  const ref = useInstancias(items, glow);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]} castShadow={sombra} receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial roughness={r} metalness={m} toneMapped={!glow} />
    </instancedMesh>
  );
}

function Estructura({ d, p, vista, patio, onTaller }: { d: Distribucion; p: Paleta; vista: Vista; patio: boolean; onTaller?: () => void }) {
  const n = neutros(p);
  const tonos = p.oscuro ? TONOS.oscuro : TONOS.claro;
  const x0 = -d.ancho / 2, z0 = -d.fondo / 2, x1 = d.ancho / 2, z1 = d.fondo / 2;
  const tex = useTexturaRack(p);
  useLiberar(tex);
  const verRacks = vista === "todos" || vista === "inmuebles";
  const verAndenes = verRacks;
  // la textura se repite cada 13.5 m (5 bahías)
  useEffect(() => { tex.repeat.set(Math.max(1, d.fondo / 13.5 * 0.8), 1); tex.needsUpdate = true; }, [tex, d.fondo]);
  const muros: { pos: V3; args: V3 }[] = [
    { pos: [0, ALTO_MURO / 2, z0 - 0.15], args: [d.ancho + 0.3, ALTO_MURO, 0.3] },
    { pos: [0, ALTO_MURO / 2, z1 + 0.15], args: [d.ancho + 0.3, ALTO_MURO, 0.3] },
    { pos: [x0 - 0.15, ALTO_MURO / 2, 0], args: [0.3, ALTO_MURO, d.fondo] },
    { pos: [x1 + 0.15, ALTO_MURO / 2, 0], args: [0.3, ALTO_MURO, d.fondo] },
  ];
  const traileres = d.andenes.filter((_, i) => Math.abs(Math.sin(i * 7.31)) > 0.45);
  const itemsRacks = useMemo(() => d.racks.map((r): Item => ({ pos: [r.x, ALTO_RACK / 2, r.z + r.largo / 2], escala: [1, 1, r.largo] })), [d.racks]);
  const racks = useInstancias(itemsRacks);
  // clic en el taller: abre la lista de equipos en Mantto (como en el interior genérico)
  const clicTaller = onTaller ? {
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onTaller(); },
    onPointerOver: () => { document.body.style.cursor = "pointer"; },
    onPointerOut: () => { document.body.style.cursor = ""; },
  } : {};
  return (
    <group>
      {/* patio y piso de la nave (en el Resumen el patio es la base de la escena) */}
      {patio && (
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[d.ancho + 80, d.fondo + 70]} />
          <meshStandardMaterial color={tonos.patio} roughness={0.95} />
        </mesh>
      )}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[d.ancho, d.fondo]} />
        <meshStandardMaterial color={p.pisoNave} roughness={0.6} />
      </mesh>
      {d.zonas.map((z) => {
        const pilar = PILAR_TONO[z.tono as keyof typeof tonos];
        const color = vista === "todos" || !pilar || pilar === vista ? tonos[z.tono as keyof typeof tonos] ?? n.piso : n.piso;
        return (
          <mesh key={z.id} position={[z.x + z.w / 2, 0.02, z.z + z.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow {...(z.tono === "taller" ? clicTaller : {})}>
            <planeGeometry args={[z.w, z.d]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        );
      })}
      {/* muros bajos (corte tipo casa de muñecas) */}
      {muros.map((m, i) => (
        <mesh key={i} position={m.pos} castShadow receiveShadow>
          <boxGeometry args={m.args} />
          <Mat color={p.muro} r={0.7} />
        </mesh>
      ))}
      {/* oficinas y baños como bloques bajos */}
      {d.zonas.filter((z) => z.tono === "oficina").map((z) => (
        <mesh key={`ofi-${z.id}`} position={[z.x + z.w / 2, 1.3, z.z + z.d / 2]} castShadow receiveShadow>
          <boxGeometry args={[z.w - 1, 2.6, z.d - 1]} />
          <meshStandardMaterial color={vista === "todos" || vista === "inmuebles" ? p.muro : n.objeto} roughness={0.6} transparent opacity={0.92} />
        </mesh>
      ))}
      {/* racks: una pieza por fila con la textura de bahías en los costados */}
      {d.racks.length > 0 && (
        <instancedMesh key={d.racks.length} ref={racks} args={[undefined, undefined, d.racks.length]} castShadow receiveShadow>
          <boxGeometry args={[ANCHO_RACK, ALTO_RACK, 1]} />
          {verRacks ? (
            <>
              <meshStandardMaterial attach="material-0" map={tex} roughness={0.7} />
              <meshStandardMaterial attach="material-1" map={tex} roughness={0.7} />
              <meshStandardMaterial attach="material-2" color={p.carton} roughness={0.8} />
              <meshStandardMaterial attach="material-3" color={p.poste} />
              <meshStandardMaterial attach="material-4" color={p.poste} roughness={0.5} />
              <meshStandardMaterial attach="material-5" color={p.poste} roughness={0.5} />
            </>
          ) : <meshStandardMaterial color={n.rack} roughness={0.8} />}
        </instancedMesh>
      )}
      {/* andenes: cortina, rampa niveladora y tráileres afuera */}
      <Lote items={d.andenes.map((a) => ({ pos: [a.x, 1.6, a.norte ? a.z + 0.35 : a.z - 0.35], color: verAndenes ? p.estructuraClara : n.objeto }))} args={[3, 3.2, 0.12]} sombra={false} />
      <Lote items={d.andenes.map((a) => ({ pos: [a.x, 0.04, a.norte ? a.z + 1.6 : a.z - 1.6], color: verAndenes ? p.amarillo : n.objeto }))} args={[2.6, 0.08, 2.4]} sombra={false} />
      <Lote items={d.andenes.map((a) => ({ pos: [a.x + 1.9, 2.9, a.norte ? a.z + 0.4 : a.z - 0.4], color: !verAndenes || !a.estado ? n.objeto : a.estado === "paro" ? p.paro : p.ok }))} args={[0.35, 0.35, 0.12]} sombra={false} glow={verAndenes && d.andenes.some((a) => a.estado)} />
      <Lote items={traileres.map((a) => ({ pos: [a.x, 2.1, a.norte ? a.z - 8.5 : a.z + 8.5], color: !verAndenes ? n.objeto : p.oscuro ? "#4a5257" : "#f4f5f7" }))} args={[2.5, 3.6, 15]} r={0.4} />
      {/* rayas de cajones del taller */}
      {d.zonas.filter((z) => z.tono === "taller").map((z) => (
        <mesh key={`raya-${z.id}`} position={[z.x + z.w / 2, 0.03, z.z + z.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[z.w - 1.2, z.d - 1.2]} />
          <meshBasicMaterial color={vista === "todos" || vista === "moviles" ? p.paro : n.objeto} transparent opacity={0.08} toneMapped={false} />
        </mesh>
      ))}
      {d.etiquetas.map((e, i) => <Etiqueta key={i} texto={e.texto} x={e.x} z={e.z} y={e.y} p={p} alto={e.texto.length > 18 ? 3.2 : 3.8} />)}
    </group>
  );
}

// ── Activos genéricos por categoría (forma sencilla + luz de estado) ───────────────────────────────
function colorEstado(p: Paleta, e: Estado) { return e === "paro" ? p.paro : e === "renta" ? p.renta : p.ok; }

/** Anillo que pulsa bajo lo que está en falla (solo mientras la escena anima). */
function Pulso({ p, pos, r = 2 }: { p: Paleta; pos: V3; r?: number }) {
  const ref = useRef<Mesh>(null);
  const reloj = useReloj();
  useFrame(() => {
    if (!ref.current || p.quieto || !reloj.vivo) return;
    const k = (reloj.t * 0.7 + pos[0] * 0.13) % 1;
    ref.current.scale.setScalar(1 + k * 1.2);
    (ref.current.material as MeshBasicMaterial).opacity = 0.55 * (1 - k);
  });
  return (
    <mesh ref={ref} position={[pos[0], 0.06, pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r * 1.15, 40]} />
      <meshBasicMaterial color={p.paro} transparent opacity={0.5} toneMapped={false} />
    </mesh>
  );
}

function Activos({ d, p, vista }: { d: Distribucion; p: Paleta; vista: Vista }) {
  const n = neutros(p);
  // color de estado solo si es del pilar que se ve y hay dato; si no, neutro (contexto)
  const ver = (a: Activo) => !!a.estado && (vista === "todos" || PILAR_DE[a.categoria] === vista);
  const verCat = (c: Categoria) => vista === "todos" || PILAR_DE[c] === vista;
  const de = (c: Categoria) => d.activos.filter((a) => a.categoria === c);
  const cuerpo = (a: Activo, color: string) => (verCat(a.categoria) ? color : n.objeto);
  const luces = (lista: Activo[], y: number, dz = 0) => lista.filter(ver).map((a) => ({ pos: [a.x, y, a.z + dz] as V3, color: colorEstado(p, a.estado!) }));
  const unicos = d.activos.filter((a) => ["osmosis", "carcamo", "subestacion", "compresor"].includes(a.categoria));
  return (
    <group>
      {/* cargadores de baterías (Móviles) */}
      <Lote items={de("cargador").map((a) => ({ pos: [a.x, 0.8, a.z], color: cuerpo(a, p.cargador) }))} args={[0.9, 1.6, 0.6]} r={0.45} m={0.2} />
      <Lote items={luces(de("cargador"), 1.35, 0.31)} args={[0.5, 0.25, 0.04]} sombra={false} glow />
      {/* tableros eléctricos (Críticos) */}
      <Lote items={de("tablero").map((a) => ({ pos: [a.x, 1.1, a.z], color: cuerpo(a, p.gabinete) }))} args={[1.4, 2.2, 0.6]} r={0.4} m={0.3} />
      <Lote items={luces(de("tablero"), 2.0, -0.31)} args={[0.3, 0.3, 0.04]} sombra={false} glow />
      {/* minisplits sobre oficinas (Inmuebles) */}
      <Lote items={de("minisplit").map((a) => ({ pos: [a.x, 2.95, a.z], color: cuerpo(a, p.oscuro ? "#d5dbde" : "#ffffff") }))} args={[1.1, 0.75, 0.45]} r={0.35} />
      <Lote items={luces(de("minisplit"), 3.4)} args={[0.25, 0.12, 0.25]} sombra={false} glow />
      {/* equipos de instalaciones: piezas sencillas por categoría */}
      {unicos.map((a) => {
        const v = verCat(a.categoria);
        const met = v ? p.estructuraClara : n.objeto;
        return (
          <group key={a.id} position={[a.x, 0, a.z]}>
            {a.categoria === "osmosis" && <>
              <mesh position={[-3, 2.2, 0]} castShadow><cylinderGeometry args={[1.6, 1.6, 4.4, 24]} /><Mat color={v ? (p.oscuro ? "#5f7f99" : "#d7e6f3") : n.objeto} r={0.35} /></mesh>
              <mesh position={[1, 2.2, 0]} castShadow><cylinderGeometry args={[1.6, 1.6, 4.4, 24]} /><Mat color={v ? (p.oscuro ? "#5f7f99" : "#d7e6f3") : n.objeto} r={0.35} /></mesh>
              <mesh position={[4.6, 0.8, 0]} castShadow><boxGeometry args={[3, 1.6, 2]} /><Mat color={met} r={0.4} m={0.3} /></mesh>
            </>}
            {a.categoria === "carcamo" && <>
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[5, 5]} /><meshStandardMaterial color={p.oscuro ? "#0a0c0d" : "#5b6066"} /></mesh>
              <mesh position={[-1.2, 0.6, 0]} castShadow><cylinderGeometry args={[0.45, 0.45, 1.2, 16]} /><Mat color={met} r={0.4} m={0.4} /></mesh>
              <mesh position={[1.2, 0.6, 0]} castShadow><cylinderGeometry args={[0.45, 0.45, 1.2, 16]} /><Mat color={met} r={0.4} m={0.4} /></mesh>
            </>}
            {a.categoria === "subestacion" && <>
              <mesh position={[0, 1.4, 0]} castShadow><boxGeometry args={[6, 2.8, 4]} /><Mat color={met} r={0.45} m={0.4} /></mesh>
              <mesh position={[0, 0.9, 0]}><boxGeometry args={[9, 1.8, 7]} /><meshStandardMaterial color={v ? p.amarillo : n.objeto} wireframe /></mesh>
            </>}
            {a.categoria === "compresor" && <>
              <mesh position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.8, 0.8, 3.2, 20]} /><Mat color={met} r={0.35} m={0.4} /></mesh>
              <mesh position={[0, 2, 0]} castShadow><boxGeometry args={[1.6, 0.8, 1]} /><Mat color={v ? p.gabinete : n.objeto} r={0.4} /></mesh>
            </>}
            {ver(a) && (
              <mesh position={[0, a.categoria === "osmosis" ? 5 : 3.2, 0]}>
                <sphereGeometry args={[0.45, 16, 16]} />
                <Mat color={colorEstado(p, a.estado!)} glow />
              </mesh>
            )}
          </group>
        );
      })}
      {d.activos.filter((a) => a.estado === "paro" && ver(a) && a.categoria !== "cargador").map((a) => (
        <Pulso key={`pulso-${a.id}`} p={p} pos={[a.x, 0, a.z]} r={["osmosis", "subestacion"].includes(a.categoria) ? 6 : 1.4} />
      ))}
    </group>
  );
}

// ── Flota instanciada ─────────────────────────────────────────────────────────────────────────────
// Cada tipo de equipo es una ficha de pocas cajas (las medidas de la ficha simple de Equipos3D) con lo que lo
// distingue de lejos: contrapeso con su contrapeso atrás, reach con patas, doble fondo con mástil alto y
// pantógrafo, patín bajo con horquillas largas. La carrocería lleva el color de estado (verde opera, ámbar renta,
// rojo en Mantto) y la torreta, verde o roja. Tres piezas por tipo: a lo más 12 llamadas de dibujo para la flota.
type Caja = [number, number, number, number, number, number]; // ancho, alto, fondo, x, y, z (frente hacia +X)
const PIEZAS: Record<TipoEquipo, { cuerpo: Caja[]; estructura: Caja[]; torreta: [number, number, number] }> = {
  contrapeso: {
    cuerpo: [[1.0, 0.75, 0.9, -0.1, 0.48, 0], [0.55, 0.9, 0.92, -0.55, 0.55, 0]],
    estructura: [[0.12, 2.3, 0.62, 0.62, 1.2, 0], [0.95, 0.05, 0.84, 0.0, 2.05, 0], [0.95, 0.04, 0.09, 1.05, 0.12, -0.2], [0.95, 0.04, 0.09, 1.05, 0.12, 0.2]],
    torreta: [-0.35, 2.3, 0],
  },
  reach: {
    cuerpo: [[0.75, 1.05, 0.9, -0.35, 0.6, 0]],
    estructura: [[0.1, 2.7, 0.5, 0.32, 1.4, 0], [1.25, 0.16, 0.14, 0.58, 0.1, -0.34], [1.25, 0.16, 0.14, 0.58, 0.1, 0.34], [1.05, 0.06, 0.9, -0.2, 2.1, 0]],
    torreta: [-0.35, 2.3, 0],
  },
  doble: {
    cuerpo: [[0.8, 1.1, 0.92, -0.4, 0.62, 0]],
    estructura: [[0.1, 3.3, 0.64, 0.12, 1.7, 0], [1.45, 0.16, 0.14, 0.72, 0.1, -0.38], [1.45, 0.16, 0.14, 0.72, 0.1, 0.38], [0.6, 0.5, 0.62, 0.55, 1.4, 0], [0.9, 0.06, 0.9, -0.4, 2.15, 0]],
    torreta: [-0.35, 2.3, 0],
  },
  patin: {
    cuerpo: [[0.62, 0.72, 0.8, 0.02, 0.5, 0]],
    estructura: [[0.62, 0.14, 0.82, -0.55, 0.12, 0], [1.35, 0.08, 0.17, 1.08, 0.07, -0.2], [1.35, 0.08, 0.17, 1.08, 0.07, 0.2], [0.07, 0.7, 0.07, -0.15, 1.15, -0.18]],
    torreta: [-0.35, 1.1, 0],
  },
};
const TIPOS = Object.keys(PIEZAS) as TipoEquipo[];

function fundir(cajas: Caja[]): BufferGeometry {
  const geos = cajas.map(([w, h, d, x, y, z]) => new BoxGeometry(w, h, d).translate(x, y, z));
  const g = mergeGeometries(geos);
  geos.forEach((x) => x.dispose());
  return g;
}

/** Geometrías y materiales de la flota, compartidos por tema (se crean una vez y viven lo que dura la página). */
const MOLDES = new Map<string, Record<TipoEquipo, { cuerpo: BufferGeometry; estructura: BufferGeometry; torreta: BufferGeometry }> & { mats: { cuerpo: MeshStandardMaterial; estructura: MeshStandardMaterial; torreta: MeshBasicMaterial } }>();
function moldes(p: Paleta) {
  const clave = p.estructura;
  let m = MOLDES.get(clave);
  if (!m) {
    const porTipo = Object.fromEntries(TIPOS.map((t) => {
      const torreta: BufferGeometry = new BoxGeometry(0.2, 0.2, 0.2).translate(...PIEZAS[t].torreta);
      return [t, { cuerpo: fundir(PIEZAS[t].cuerpo), estructura: fundir(PIEZAS[t].estructura), torreta }];
    })) as unknown as Record<TipoEquipo, { cuerpo: BufferGeometry; estructura: BufferGeometry; torreta: BufferGeometry }>;
    m = Object.assign(porTipo, {
      mats: {
        cuerpo: new MeshStandardMaterial({ roughness: 0.35 }),
        estructura: new MeshStandardMaterial({ color: p.estructura, roughness: 0.4, metalness: 0.4 }),
        torreta: new MeshBasicMaterial({ toneMapped: false }),
      },
    });
    MOLDES.set(clave, m);
  }
  return m;
}

const _m = new Matrix4(), _o = new Object3D(), _c = new Color();

function Flota({ d, p }: { d: Distribucion; p: Paleta }) {
  const reloj = useReloj();
  const invalidate = useThree((s) => s.invalidate);
  const molde = moldes(p);
  const porTipo = useMemo(() => Object.fromEntries(TIPOS.map((t) => [t, d.montacargas.filter((m) => m.tipo === t)])) as Record<TipoEquipo, Montacargas[]>, [d]);
  const mallas = useRef(new Map<string, InstancedMesh>());
  const registrar = (clave: string) => (el: InstancedMesh | null) => { if (el) mallas.current.set(clave, el); else mallas.current.delete(clave); };
  const sucio = useRef(true);

  // colores por instancia: estado en la carrocería y en la torreta; blanco en la estructura (comparte programa)
  useLayoutEffect(() => {
    for (const t of TIPOS) {
      porTipo[t].forEach((m, i) => {
        mallas.current.get(`${t}-cuerpo`)?.setColorAt(i, _c.set(m.estado === "paro" ? p.paro : m.estado === "renta" ? p.renta : p.cuerpo));
        mallas.current.get(`${t}-torreta`)?.setColorAt(i, _c.set(m.estado === "paro" ? p.paro : p.torretaOk));
        mallas.current.get(`${t}-estructura`)?.setColorAt(i, _c.set("#ffffff"));
      });
      for (const pieza of ["cuerpo", "torreta", "estructura"]) {
        const malla = mallas.current.get(`${t}-${pieza}`);
        if (malla?.instanceColor) malla.instanceColor.needsUpdate = true;
      }
    }
    sucio.current = true;
    invalidate();
  }, [porTipo, p, invalidate]);

  useFrame(() => {
    if (!sucio.current && (!reloj.vivo || p.quieto)) return;
    sucio.current = false;
    const t = reloj.t;
    for (const tipo of TIPOS) {
      const lista = porTipo[tipo];
      if (!lista.length) continue;
      const piezas = ["cuerpo", "estructura", "torreta"].map((x) => mallas.current.get(`${tipo}-${x}`));
      lista.forEach((m, i) => {
        const [x, z, rot] = pose(m, t);
        _o.position.set(x, 0, z); _o.rotation.set(0, rot, 0); _o.scale.setScalar(ESCALA_EQUIPO); _o.updateMatrix();
        _m.copy(_o.matrix);
        piezas.forEach((malla) => malla?.setMatrixAt(i, _m));
      });
      piezas.forEach((malla) => { if (malla) malla.instanceMatrix.needsUpdate = true; });
    }
  });

  return (
    <group>
      {TIPOS.map((t) => porTipo[t].length > 0 && (
        <group key={`${t}-${porTipo[t].length}`}>
          {/* frustumCulled: los equipos se mueven y la esfera de la malla no se recalcula */}
          <instancedMesh ref={registrar(`${t}-cuerpo`)} args={[molde[t].cuerpo, molde.mats.cuerpo, porTipo[t].length]} castShadow receiveShadow frustumCulled={false} dispose={null} />
          <instancedMesh ref={registrar(`${t}-estructura`)} args={[molde[t].estructura, molde.mats.estructura, porTipo[t].length]} castShadow receiveShadow frustumCulled={false} dispose={null} />
          <instancedMesh ref={registrar(`${t}-torreta`)} args={[molde[t].torreta, molde.mats.torreta, porTipo[t].length]} frustumCulled={false} dispose={null} />
        </group>
      ))}
      {/* anillo que pulsa bajo cada equipo en Mantto (están quietos en su cajón) */}
      {d.montacargas.filter((m) => m.estado === "paro").map((m) => <Pulso key={m.id} p={p} pos={[m.x, 0, m.z]} r={1.6} />)}
    </group>
  );
}

// ── Nave completa ─────────────────────────────────────────────────────────────────────────────────
/**
 * La nave centrada en su huella. `escala`: unidades de escena por metro (el Resumen la reduce para que quepa con
 * su encuadre; el prototipo la dibuja a 1). `patio`: el piso exterior (el Resumen ya tiene su base).
 */
export function Nave({ d, p, vista, escala = 1, patio = true, onTaller }: { d: Distribucion; p: Paleta; vista: Vista; escala?: number; patio?: boolean; onTaller?: () => void }) {
  return (
    <group scale={escala}>
      <group position={[-d.huella.cx, 0, -d.huella.cz]}>
        <Estructura d={d} p={p} vista={vista} patio={patio} onTaller={onTaller} />
        <Activos d={d} p={p} vista={vista} />
        {(vista === "todos" || vista === "moviles") && <Flota d={d} p={p} />}
      </group>
    </group>
  );
}

// ── Marcas en pantalla ────────────────────────────────────────────────────────────────────────────
// Tamaño fijo: lo importante del pilar que se ve (instalaciones críticas, el taller) y todo lo que está en falla,
// para encontrarlo aunque la nave mida 300 m.
export type Marca = { id: string; texto: string; x: number; y: number; z: number; falla: boolean };
const NOMBRE: Partial<Record<Categoria, string>> = {
  osmosis: "Ósmosis", carcamo: "Cárcamo", subestacion: "Subestación", compresor: "Compresor",
  tablero: "Tablero eléctrico", minisplit: "Minisplit", cargador: "Cargador",
};

export function marcasDe(d: Distribucion, vista: Vista): Marca[] {
  const ver = (c: Categoria) => vista === "todos" || PILAR_DE[c] === vista;
  const r: Marca[] = [];
  if (vista === "todos" || vista === "moviles") {
    const taller = d.zonas.find((z) => z.tono === "taller");
    // cuenta también los que no caben en los cajones
    const n = d.montacargas.filter((m) => m.estado === "paro").length + d.sinLugar;
    if (taller) r.push({ id: "taller", texto: `Mantto · ${n} ${n === 1 ? "equipo" : "equipos"}`, x: taller.x + taller.w / 2, y: 4, z: taller.z + taller.d / 2, falla: n > 0 });
  }
  for (const a of d.activos) {
    if (!ver(a.categoria) || !a.estado) continue;
    const unico = ["osmosis", "carcamo", "subestacion", "compresor"].includes(a.categoria);
    if (!unico && a.estado !== "paro") continue;
    r.push({ id: a.id, texto: `${NOMBRE[a.categoria] ?? a.categoria} · ${a.estado === "paro" ? "falla" : "OK"}`, x: a.x, y: a.categoria === "osmosis" ? 6 : 4, z: a.z, falla: a.estado === "paro" });
  }
  if (ver("anden")) d.andenes.forEach((a, i) => { if (a.estado === "paro") r.push({ id: `and${i}`, texto: `Andén ${i + 1} · falla`, x: a.x, y: 4, z: a.z, falla: true }); });
  return r;
}

/** Proyecta las marcas (en metros de la nave) a la pantalla en cada cuadro dibujado. */
export function ProyectorMarcas({ marcas, refs, d, escala = 1 }: { marcas: Marca[]; refs: React.RefObject<(HTMLSpanElement | null)[]>; d: Distribucion; escala?: number }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    marcas.forEach((m, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      v.set((m.x - d.huella.cx) * escala, m.y * escala, (m.z - d.huella.cz) * escala).project(camera);
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    });
  });
  return null;
}

/** Las marcas como etiquetas HTML (van fuera del Canvas, sobre la escena). */
export function CapaMarcas({ marcas, refs }: { marcas: Marca[]; refs: React.RefObject<(HTMLSpanElement | null)[]> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {marcas.map((m, i) => (
        <span key={m.id} ref={(el) => { refs.current[i] = el; }}
          className={`absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-vidrio-fuerte py-0.5 pl-1 pr-2.5 text-[12px] font-medium shadow-[0_4px_16px_rgb(0_0_0/0.08)] ${m.falla ? "text-paro-texto" : "text-tinta"}`}>
          <span className={`h-3 w-3 rounded-full ${m.falla ? "bg-paro" : "bg-ok"}`} />{m.texto}
        </span>
      ))}
    </div>
  );
}
