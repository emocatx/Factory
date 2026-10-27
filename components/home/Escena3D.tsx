"use client";

// Escena 3D del home de Móviles (react-three-fiber). Se carga solo en escritorio y con carga diferida
// (ver HomeMoviles): en celular no se descarga ni un byte de Three.js.
// Dibuja TODOS los almacenes en una cuadrícula; los que tienen equipos en taller (o el elegido) van con
// todo el detalle y los demás en versión ligera, para que la escena siga fluida.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { Environment, Lightformer, OrbitControls, OrthographicCamera, PerformanceMonitor, RoundedBox, SoftShadows } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Mat } from "./Equipos3D";
import { NaveInterior, type NaveEscena } from "./NaveInterior";
import { PALETA, PALETA_OSCURA, type Paleta } from "./paleta";

const SEP_X = 13;
const SEP_Z = 12;
/** Espacio que ocupan los paneles fijos sobre la escena (izquierda y franjas de arriba y abajo). */
const PANEL_IZQ = 360;
const FRANJAS_ALTO = 280;
/** Offset de la cámara respecto a su objetivo (vista isométrica). */
const OFFSET_CAMARA: [number, number, number] = [34, 30, 34];

type Malla = { cols: number; filas: number; ancho: number; fondo: number };

function malla(n: number): Malla {
  const cols = n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : Math.ceil(Math.sqrt(n * 1.4));
  const filas = Math.max(1, Math.ceil(n / cols));
  return { cols, filas, ancho: cols * SEP_X, fondo: filas * SEP_Z };
}

function posicion(i: number, m: Malla): [number, number, number] {
  const col = i % m.cols;
  const fila = Math.floor(i / m.cols);
  return [(col - (m.cols - 1) / 2) * SEP_X, 0, (fila - (m.filas - 1) / 2) * SEP_Z];
}

/** Zoom con el que el conjunto (o una nave) cabe en el espacio que dejan libre los paneles. */
function zoomPara(ancho: number, alto: number, w: number, d: number) {
  const proy = 0.707 * (w + d); // ancho aproximado en pantalla de un rectángulo w×d en isométrico
  return Math.max(4, Math.min((ancho - PANEL_IZQ) / proy, (alto - FRANJAS_ALTO) / (proy * 0.62), 36));
}

/** Corre el objetivo para que lo enfocado quede centrado en el espacio libre (a la derecha del panel). */
function objetivo(x: number, z: number, zoom: number, meta: Vector3) {
  const d = PANEL_IZQ / 2 / zoom / Math.SQRT2;
  return meta.set(x - d, 0, z + d);
}

function Arbol({ p, posicion: pos, s = 1 }: { p: Paleta; posicion: [number, number, number]; s?: number }) {
  return (
    <group position={pos} scale={s}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
        <Mat color={p.madera} r={0.9} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.55, 16, 16]} />
        <Mat color={p.arbol} r={0.7} />
      </mesh>
    </group>
  );
}

function Calles({ p, m }: { p: Paleta; m: Malla }) {
  return (
    <group>
      <RoundedBox args={[m.ancho + 5, 0.3, m.fondo + 6]} radius={0.2} position={[0, -0.32, 0]} receiveShadow>
        <Mat color={p.base} r={1} />
      </RoundedBox>
      {Array.from({ length: m.filas - 1 }, (_, f) => (
        <mesh key={`f${f}`} position={[0, 0, (f + 1 - m.filas / 2) * SEP_Z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[m.ancho + 2, 0.14]} />
          <meshBasicMaterial color={p.linea} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: m.cols - 1 }, (_, c) => (
        <mesh key={`c${c}`} position={[(c + 1 - m.cols / 2) * SEP_X, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, m.fondo + 2]} />
          <meshBasicMaterial color={p.linea} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Marcador rojo que flota sobre el taller del almacén con más equipos en taller. */
function Alerta({ p, pos }: { p: Paleta; pos: [number, number, number] }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && !p.quieto) ref.current.position.y = 3.4 + Math.sin(clock.elapsedTime * 2) * 0.18;
  });
  return (
    <group ref={ref} position={[pos[0], 3.4, pos[2] + 2.9]}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.35, 0.7, 20]} />
        <Mat color={p.paro} glow r={0.3} />
      </mesh>
      <mesh position={[0, -3.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.32, 24]} />
        <meshBasicMaterial color={p.paro} transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Al cambiar la selección (o el tamaño) lleva la cámara a la nave elegida o al conjunto, y se detiene:
// después el usuario puede girar y acercar a mano sin que la cámara regrese sola.
function Enfoque({ naves, seleccion, m }: { naves: NaveEscena[]; seleccion: string | null; m: Malla }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const { width: ancho, height: alto } = useThree((s) => s.size);
  const meta = useMemo(() => new Vector3(), []);
  const animando = useRef(true);
  useEffect(() => { animando.current = true; }, [seleccion, ancho, alto]);
  useFrame(() => {
    if (!controls || !animando.current) return;
    const i = naves.findIndex((n) => n.id === seleccion);
    let zoom: number;
    if (i >= 0) {
      const [x, , z] = posicion(i, m);
      zoom = Math.min(34, zoomPara(ancho, alto, 11.4, 10.4) * 0.9);
      objetivo(x, z, zoom, meta);
    } else {
      zoom = zoomPara(ancho, alto, m.ancho, m.fondo);
      objetivo(0, 0, zoom, meta);
    }
    const cam = controls.object as unknown as { zoom: number; position: Vector3; updateProjectionMatrix: () => void };
    cam.zoom += (zoom - cam.zoom) * 0.1;
    cam.updateProjectionMatrix();
    const antes = controls.target.clone();
    controls.target.lerp(meta, 0.1);
    cam.position.add(controls.target.clone().sub(antes));
    controls.update();
    if (Math.abs(cam.zoom - zoom) < 0.02 && controls.target.distanceTo(meta) < 0.01) animando.current = false;
  });
  return null;
}

// Etiquetas HTML sobre cada nave, proyectando su punto 3D a la pantalla.
// (Se evita <Html> de drei: con React 19 a veces desmonta la primera etiqueta.)
// Con muchos almacenes, en la vista general solo llevan etiqueta los que tienen equipos en taller;
// los demás la muestran al acercarse o al elegirlos (si no, se enciman).
const ZOOM_ETIQUETAS = 16;

function Proyector({ naves, refs, m, seleccion }: { naves: NaveEscena[]; refs: React.RefObject<(HTMLButtonElement | null)[]>; m: Malla; seleccion: string | null }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const cerca = (camera as unknown as { zoom: number }).zoom >= ZOOM_ETIQUETAS || naves.length <= 6;
    naves.forEach((n, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      const ver = n.paro > 0 || cerca || n.id === seleccion;
      el.style.visibility = ver ? "visible" : "hidden";
      if (!ver) return;
      const [x, , z] = posicion(i, m);
      v.set(x, 3.6, z - 2.4).project(camera);
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    });
  });
  return null;
}

export default function Escena3D({ naves, seleccion, onSelect, onTaller, quieto, oscuro = false }: {
  naves: NaveEscena[]; seleccion: string | null; onSelect: (id: string | null) => void; onTaller: (id: string) => void; quieto: boolean; oscuro?: boolean;
}) {
  const p: Paleta = { ...(oscuro ? PALETA_OSCURA : PALETA), quieto, oscuro };
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [alta, setAlta] = useState(true);
  const m = useMemo(() => malla(naves.length), [naves.length]);
  // Con más de 6 naves se baja el detalle de lo que no está enfocado y se quitan las sombras suaves.
  const muchas = naves.length > 6;
  const peor = naves.reduce((a, n, i) => (n.paro > (naves[a]?.paro ?? -1) ? i : a), 0);
  const sombra = Math.max(m.ancho, m.fondo) / 2 + 6;
  const esquina: [number, number, number] = [-m.ancho / 2 - 1.5, 0, -m.fondo / 2 - 2];
  const esquina2: [number, number, number] = [m.ancho / 2 + 1.5, 0, m.fondo / 2 + 2];

  return (
    <>
      <Canvas shadows={alta} dpr={alta ? [1, muchas ? 1.5 : 2] : 1} gl={{ antialias: false }} onPointerMissed={() => onSelect(null)} aria-hidden="true">
        {/* Si el equipo no da los cuadros por segundo, se apagan sombras y efectos y baja la resolución. */}
        <PerformanceMonitor onDecline={() => setAlta(false)} />
        <color attach="background" args={[p.fondo]} />
        {alta && !muchas && <SoftShadows size={18} samples={8} focus={0.6} />}
        <OrthographicCamera makeDefault position={OFFSET_CAMARA} zoom={10} near={-300} far={600} />
        <OrbitControls makeDefault enablePan={false} enableZoom minZoom={3} maxZoom={48} minPolarAngle={Math.PI / 5} maxPolarAngle={Math.PI / 3} target={[0, 0, 0]} />
        <ambientLight intensity={p.ambiente} />
        <hemisphereLight args={oscuro ? ["#bfefe2", "#0a0e1c", 0.35] : ["#fff6e8", "#c9d3e2", 0.35]} />
        <directionalLight position={[16, 32, 22]} intensity={p.luz} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.02}
          shadow-camera-left={-sombra} shadow-camera-right={sombra} shadow-camera-top={sombra} shadow-camera-bottom={-sombra} shadow-camera-far={200} />
        <directionalLight position={[-18, 14, -20]} intensity={oscuro ? 0.5 : 0.35} color={oscuro ? "#3dd6ac" : "#cfe0ff"} />
        <Environment resolution={128} environmentIntensity={p.env}>
          <Lightformer intensity={2.5} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
          <Lightformer intensity={1.2} position={[-20, 4, 10]} rotation-y={Math.PI / 2} scale={[20, 6, 1]} />
          <Lightformer intensity={1.2} position={[20, 4, -10]} rotation-y={-Math.PI / 2} scale={[20, 6, 1]} />
        </Environment>
        <Calles p={p} m={m} />
        {naves.map((n, i) => (
          <group key={n.id} position={posicion(i, m)}>
            <NaveInterior nave={n} i={i} p={p} seleccionada={seleccion === n.id} onSelect={onSelect} onTaller={onTaller}
              ligera={muchas && n.paro === 0 && seleccion !== n.id} simple={muchas && seleccion !== n.id} />
          </group>
        ))}
        <Arbol p={p} posicion={esquina} />
        <Arbol p={p} posicion={[esquina[0] + 1.5, 0, esquina[2] - 0.6]} s={0.7} />
        <Arbol p={p} posicion={esquina2} />
        <Arbol p={p} posicion={[esquina2[0] - 1.6, 0, esquina2[2] + 0.6]} s={0.8} />
        {naves[peor]?.paro > 0 && <Alerta p={p} pos={posicion(peor, m)} />}
        <Enfoque naves={naves} seleccion={seleccion} m={m} />
        <Proyector naves={naves} refs={refs} m={m} seleccion={seleccion} />
        {alta && (
          <EffectComposer multisampling={0} enableNormalPass={false}>
            <N8AO aoRadius={1.6} intensity={p.ao} distanceFalloff={0.6} quality="medium" halfRes />
            <Vignette offset={0.35} darkness={oscuro ? 0.5 : 0.18} />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {naves.map((n, i) => (
          <button key={n.id} ref={(el) => { refs.current[i] = el; }} type="button" onClick={() => onSelect(n.id)}
            className={`pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-vidrio-fuerte py-0.5 pl-0.5 pr-2.5 font-medium text-tinta shadow-[0_4px_16px_rgb(0_0_0/0.08)] backdrop-blur-md hover:z-10 hover:border-azul ${n.paro > 0 ? "text-[12px]" : "text-[11px] text-suave"} ${seleccion === n.id ? "z-10 border-azul" : i === peor && n.paro > 0 ? "border-paro/60" : "border-borde/50"}`}>
            <span className={`rounded-full ring-inset ring-panel ${n.paro > 0 ? "h-5 w-5 bg-paro ring-[5px]" : "h-4 w-4 bg-ok ring-[4px]"}`} aria-hidden="true" />
            <span>
              {i === peor && n.paro > 0 && <small className="block text-[10px] font-semibold leading-none text-paro-texto">Más equipos en taller</small>}
              {n.nombre}{n.paro > 0 ? ` · ${n.paro} en taller` : ""}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
