"use client";

// Planta de un almacén armada desde su ficha (ver ficha.ts). Escala real en metros.
// Estructura (piso, muros, racks, andenes, zonas) siempre presente como contexto; los activos llevan color
// de estado solo si son del pilar que se está viendo, y lo demás queda en un gris neutro.
// Rendimiento: todo lo repetido (racks, andenes, cargadores, tráileres) es geometría instanciada; los
// montacargas usan su modelo completo de cerca y una ficha simple de lejos.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { Environment, Instance, Instances, Lightformer, OrbitControls, OrthographicCamera, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Equipo, Mat } from "@/components/home/Equipos3D";
import { PALETA, PALETA_OSCURA, type Paleta } from "@/components/home/paleta";
import { PILAR_DE, type Activo, type Categoria, type Distribucion, type Estado, type Montacargas, type Pilar } from "./ficha";

type V3 = [number, number, number];
export type Vista = Pilar | "todos";

const ALTO_MURO = 3;
const ALTO_RACK = 4.5;
const ANCHO_RACK = 2.4;
/** Zoom (pixeles por metro) a partir del cual los montacargas usan su modelo completo. */
const ZOOM_DETALLE = 9;

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

// ── Piezas ────────────────────────────────────────────────────────────────────────────────────────
function Etiqueta({ texto, x, z, y = 0.08, p, alto = 2.6 }: { texto: string; x: number; z: number; y?: number; p: Paleta; alto?: number }) {
  const { t, aspecto } = useTexturaTexto(texto, p.oscuro ? "#e8ecea" : "#3a3a3c");
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[alto * aspecto, alto]} />
      <meshBasicMaterial map={t} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Instancias con color por instancia (estado). */
function Lote({ items, args, r = 0.55, m = 0, sombra = true, glow }: { items: { pos: V3; color: string; rot?: number }[]; args: V3; r?: number; m?: number; sombra?: boolean; glow?: boolean }) {
  if (!items.length) return null;
  return (
    <Instances limit={items.length} castShadow={sombra} receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial roughness={r} metalness={m} toneMapped={!glow} />
      {items.map((it, k) => <Instance key={k} position={it.pos} rotation={[0, it.rot ?? 0, 0]} color={glow ? new Color(it.color).multiplyScalar(2.2) : it.color} />)}
    </Instances>
  );
}

function Estructura({ d, p, vista }: { d: Distribucion; p: Paleta; vista: Vista }) {
  const n = neutros(p);
  const tonos = p.oscuro ? TONOS.oscuro : TONOS.claro;
  const x0 = -d.ancho / 2, z0 = -d.fondo / 2, x1 = d.ancho / 2, z1 = d.fondo / 2;
  const tex = useTexturaRack(p);
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
  return (
    <group>
      {/* patio y piso de la nave */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[d.ancho + 80, d.fondo + 70]} />
        <meshStandardMaterial color={tonos.patio} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[d.ancho, d.fondo]} />
        <meshStandardMaterial color={p.pisoNave} roughness={0.6} />
      </mesh>
      {d.zonas.map((z) => {
        const pilar = PILAR_TONO[z.tono as keyof typeof tonos];
        const color = vista === "todos" || !pilar || pilar === vista ? tonos[z.tono as keyof typeof tonos] ?? n.piso : n.piso;
        return (
          <mesh key={z.id} position={[z.x + z.w / 2, 0.02, z.z + z.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
      <Instances limit={d.racks.length} castShadow receiveShadow>
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
        {d.racks.map((r, i) => <Instance key={i} position={[r.x, ALTO_RACK / 2, r.z + r.largo / 2]} scale={[1, 1, r.largo]} />)}
      </Instances>
      {/* andenes: cortina, rampa niveladora y tráileres afuera */}
      <Lote items={d.andenes.map((a) => ({ pos: [a.x, 1.6, a.norte ? a.z + 0.35 : a.z - 0.35], color: verAndenes ? p.estructuraClara : n.objeto }))} args={[3, 3.2, 0.12]} sombra={false} />
      <Lote items={d.andenes.map((a) => ({ pos: [a.x, 0.04, a.norte ? a.z + 1.6 : a.z - 1.6], color: verAndenes ? p.amarillo : n.objeto }))} args={[2.6, 0.08, 2.4]} sombra={false} />
      <Lote items={d.andenes.map((a) => ({ pos: [a.x + 1.9, 2.9, a.norte ? a.z + 0.4 : a.z - 0.4], color: !verAndenes ? n.objeto : a.estado === "paro" ? p.paro : p.ok }))} args={[0.35, 0.35, 0.12]} sombra={false} glow={verAndenes} />
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

function Pulso({ p, pos, r = 2 }: { p: Paleta; pos: V3; r?: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || p.quieto) return;
    const k = (clock.elapsedTime * 0.7) % 1;
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
  const ver = (c: Categoria) => vista === "todos" || PILAR_DE[c] === vista;
  const de = (c: Categoria) => d.activos.filter((a) => a.categoria === c);
  const cuerpo = (c: Categoria, color: string) => (ver(c) ? color : n.objeto);
  const luces = (lista: Activo[], c: Categoria, y: number, dz = 0) =>
    ver(c) ? lista.map((a) => ({ pos: [a.x, y, a.z + dz] as V3, color: colorEstado(p, a.estado) })) : [];
  const unicos = d.activos.filter((a) => ["osmosis", "carcamo", "subestacion", "compresor"].includes(a.categoria));
  return (
    <group>
      {/* cargadores de baterías (Móviles) */}
      <Lote items={de("cargador").map((a) => ({ pos: [a.x, 0.8, a.z], color: cuerpo("cargador", p.cargador) }))} args={[0.9, 1.6, 0.6]} r={0.45} m={0.2} />
      <Lote items={luces(de("cargador"), "cargador", 1.35, 0.31)} args={[0.5, 0.25, 0.04]} sombra={false} glow />
      {/* tableros eléctricos (Críticos) */}
      <Lote items={de("tablero").map((a) => ({ pos: [a.x, 1.1, a.z], color: cuerpo("tablero", p.gabinete) }))} args={[1.4, 2.2, 0.6]} r={0.4} m={0.3} />
      <Lote items={luces(de("tablero"), "tablero", 2.0, -0.31)} args={[0.3, 0.3, 0.04]} sombra={false} glow />
      {/* minisplits sobre oficinas (Inmuebles) */}
      <Lote items={de("minisplit").map((a) => ({ pos: [a.x, 2.95, a.z], color: cuerpo("minisplit", p.oscuro ? "#d5dbde" : "#ffffff") }))} args={[1.1, 0.75, 0.45]} r={0.35} />
      <Lote items={luces(de("minisplit"), "minisplit", 3.4)} args={[0.25, 0.12, 0.25]} sombra={false} glow />
      {/* equipos de instalaciones: piezas sencillas por categoría */}
      {unicos.map((a) => {
        const v = ver(a.categoria);
        const c = v ? colorEstado(p, a.estado) : n.objeto;
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
            {v && (
              <mesh position={[0, a.categoria === "osmosis" ? 5 : 3.2, 0]}>
                <sphereGeometry args={[0.45, 16, 16]} />
                <Mat color={c} glow />
              </mesh>
            )}
          </group>
        );
      })}
      {d.activos.filter((a) => a.estado === "paro" && ver(a.categoria) && a.categoria !== "cargador").map((a) => (
        <Pulso key={`pulso-${a.id}`} p={p} pos={[a.x, 0, a.z]} r={["osmosis", "subestacion"].includes(a.categoria) ? 6 : 1.4} />
      ))}
    </group>
  );
}

// ── Montacargas en movimiento ─────────────────────────────────────────────────────────────────────
function MontacargasVivo({ m, p, detalle }: { m: Montacargas; p: Paleta; detalle: boolean }) {
  const ref = useRef<Group>(null);
  const ruta = m.ruta;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || !ruta || p.quieto) return;
    const t = clock.elapsedTime;
    if (ruta.tipo === "pasillo") {
      // ida y vuelta por su pasillo, girando al cambiar de sentido
      const s = Math.sin(t * 0.12 + ruta.fase);
      g.position.z = ruta.desde + (ruta.hasta - ruta.desde) * (0.5 + 0.5 * s);
      g.rotation.y = Math.cos(t * 0.12 + ruta.fase) >= 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      // circuito: carril norte hacia el oriente, carril sur hacia el poniente
      const L = ruta.x1 - ruta.x0, H = ruta.zb - ruta.za, P = 2 * L + 2 * H;
      let s = (ruta.s0 + t * 3.2) % P;
      if (s < L) { g.position.set(ruta.x0 + s, 0, ruta.za); g.rotation.y = 0; }
      else if ((s -= L) < H) { g.position.set(ruta.x1, 0, ruta.za + s); g.rotation.y = -Math.PI / 2; }
      else if ((s -= H) < L) { g.position.set(ruta.x1 - s, 0, ruta.zb); g.rotation.y = Math.PI; }
      else { s -= L; g.position.set(ruta.x0, 0, ruta.zb - s); g.rotation.y = Math.PI / 2; }
    }
  });
  const estado = m.estado === "paro" ? "paro" : m.estado === "renta" ? "renta" : "normal";
  return (
    <group ref={ref} position={[m.x, 0, m.z]} rotation={[0, m.rot, 0]}>
      <Equipo p={p} tipo={m.tipo} estado={estado} posicion={[0, 0, 0]} escala={1.25} simple={!detalle} />
    </group>
  );
}

function Flota({ d, p, vista }: { d: Distribucion; p: Paleta; vista: Vista }) {
  const camara = useThree((s) => s.camera) as unknown as { zoom: number };
  const [detalle, setDetalle] = useState(false);
  // cambia de ficha simple a modelo completo solo al cruzar el umbral (no en cada cuadro)
  useFrame(() => { const d = camara.zoom >= ZOOM_DETALLE; if (d !== detalle) setDetalle(d); });
  if (vista !== "todos" && vista !== "moviles") return null;
  return <group>{d.montacargas.map((m) => <MontacargasVivo key={m.id} m={m} p={p} detalle={detalle} />)}</group>;
}

// ── Cámara y medidor ──────────────────────────────────────────────────────────────────────────────
function Encuadre({ d, clave }: { d: Distribucion; clave: string }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const { width, height } = useThree((s) => s.size);
  useEffect(() => {
    if (!controls) return;
    const cam = controls.object as unknown as { zoom: number; position: Vector3; updateProjectionMatrix: () => void };
    const proy = 0.707 * (d.ancho + d.fondo + 40);
    cam.zoom = Math.max(1.5, Math.min((width - 80) / proy, (height - 160) / (proy * 0.6)));
    cam.position.set(110, 100, 110);
    controls.target.set(0, 0, 0);
    cam.updateProjectionMatrix();
    controls.update();
  }, [controls, d, clave, width, height]);
  return null;
}

// Marcas con tamaño fijo en pantalla: lo importante del pilar que se ve (instalaciones críticas, el taller)
// y todo lo que está en falla, para encontrarlo aunque la nave mida 300 m.
type Marca = { id: string; texto: string; x: number; y: number; z: number; falla: boolean };
const NOMBRE: Partial<Record<Categoria, string>> = {
  osmosis: "Ósmosis", carcamo: "Cárcamo", subestacion: "Subestación", compresor: "Compresor",
  tablero: "Tablero eléctrico", minisplit: "Minisplit", cargador: "Cargador",
};

function marcasDe(d: Distribucion, vista: Vista): Marca[] {
  const ver = (c: Categoria) => vista === "todos" || PILAR_DE[c] === vista;
  const r: Marca[] = [];
  if (vista === "todos" || vista === "moviles") {
    const taller = d.zonas.find((z) => z.tono === "taller");
    const n = d.montacargas.filter((m) => m.estado === "paro").length;
    if (taller) r.push({ id: "taller", texto: `Mantto · ${n} ${n === 1 ? "equipo" : "equipos"}`, x: taller.x + taller.w / 2, y: 4, z: taller.z + taller.d / 2, falla: n > 0 });
  }
  for (const a of d.activos) {
    if (!ver(a.categoria)) continue;
    const unico = ["osmosis", "carcamo", "subestacion", "compresor"].includes(a.categoria);
    if (!unico && a.estado !== "paro") continue;
    r.push({ id: a.id, texto: `${NOMBRE[a.categoria] ?? a.categoria} · ${a.estado === "paro" ? "falla" : "OK"}`, x: a.x, y: a.categoria === "osmosis" ? 6 : 4, z: a.z, falla: a.estado === "paro" });
  }
  if (ver("anden")) d.andenes.forEach((a, i) => { if (a.estado === "paro") r.push({ id: `and${i}`, texto: `Andén ${i + 1} · falla`, x: a.x, y: 4, z: a.z, falla: true }); });
  return r;
}

function Proyector({ marcas, refs }: { marcas: Marca[]; refs: React.RefObject<(HTMLSpanElement | null)[]> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    marcas.forEach((m, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      v.set(m.x, m.y, m.z).project(camera);
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    });
  });
  return null;
}

export type Medicion = { fps: number; llamadas: number; triangulos: number; geometrias: number; texturas: number };

function Medidor({ onMedir }: { onMedir: (m: Medicion) => void }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ cuadros: 0, desde: performance.now(), llamadas: 0, triangulos: 0 });
  useEffect(() => { gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [gl]);
  useFrame(() => {
    // las llamadas del cuadro anterior, contando los pases de posproceso
    const a = acc.current;
    a.llamadas = Math.max(a.llamadas, gl.info.render.calls);
    a.triangulos = Math.max(a.triangulos, gl.info.render.triangles);
    gl.info.reset();
    a.cuadros++;
    const ahora = performance.now();
    if (ahora - a.desde >= 700) {
      onMedir({ fps: Math.round((a.cuadros * 1000) / (ahora - a.desde)), llamadas: a.llamadas, triangulos: a.triangulos, geometrias: gl.info.memory.geometries, texturas: gl.info.memory.textures });
      a.cuadros = 0; a.desde = ahora; a.llamadas = 0; a.triangulos = 0;
    }
  });
  return null;
}

export default function Planta3D({ d, clave, vista, oscuro, onMedir }: { d: Distribucion; clave: string; vista: Vista; oscuro: boolean; onMedir: (m: Medicion) => void }) {
  const p: Paleta = { ...(oscuro ? PALETA_OSCURA : PALETA), quieto: false, oscuro };
  const [alta, setAlta] = useState(true);
  const sombra = Math.max(d.ancho, d.fondo) / 2 + 30;
  const marcas = useMemo(() => marcasDe(d, vista), [d, vista]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  return (
    <>
    <Canvas shadows={alta} dpr={alta ? [1, 1.75] : 1} gl={{ antialias: false }} aria-hidden="true">
      <PerformanceMonitor onDecline={() => setAlta(false)} />
      <color attach="background" args={[p.fondo]} />
      <OrthographicCamera makeDefault position={[110, 100, 110]} zoom={3} near={-1000} far={2000} />
      <OrbitControls makeDefault enableDamping zoomToCursor screenSpacePanning={false} minZoom={1.5} maxZoom={60}
        minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.6} />
      <ambientLight intensity={p.ambiente} />
      <hemisphereLight args={oscuro ? ["#d3dbe0", "#0a0d10", 0.35] : ["#fff6e8", "#c9d3e2", 0.35]} />
      <directionalLight position={[120, 180, 90]} intensity={p.luz} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.05}
        shadow-camera-left={-sombra} shadow-camera-right={sombra} shadow-camera-top={sombra} shadow-camera-bottom={-sombra} shadow-camera-far={600} />
      <Environment resolution={128} environmentIntensity={p.env}>
        <Lightformer intensity={2.5} position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[200, 200, 1]} />
        <Lightformer intensity={1.2} position={[-150, 20, 60]} rotation-y={Math.PI / 2} scale={[120, 30, 1]} />
      </Environment>
      <Estructura d={d} p={p} vista={vista} />
      <Activos d={d} p={p} vista={vista} />
      <Flota d={d} p={p} vista={vista} />
      <Encuadre d={d} clave={clave} />
      <Medidor onMedir={onMedir} />
      <Proyector marcas={marcas} refs={refs} />
      {alta && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={3} intensity={oscuro ? 2.6 : 1.8} distanceFalloff={0.8} quality="performance" halfRes />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {marcas.map((m, i) => (
        <span key={m.id} ref={(el) => { refs.current[i] = el; }}
          className={`absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full vidrio-fuerte py-0.5 pl-1 pr-2.5 text-[12px] font-medium ${m.falla ? "text-paro-texto" : "text-tinta"}`}>
          <span className={`h-3 w-3 rounded-full ${m.falla ? "bg-paro" : "bg-ok"}`} />{m.texto}
        </span>
      ))}
    </div>
    </>
  );
}
