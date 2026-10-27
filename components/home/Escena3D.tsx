"use client";

// Escena 3D del home de Móviles (react-three-fiber). Se carga solo en escritorio y con carga diferida
// (ver HomeMoviles): en celular no se descarga ni un byte de Three.js.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { Environment, Lightformer, OrbitControls, OrthographicCamera, PerformanceMonitor, RoundedBox, SoftShadows } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Mat } from "./Equipos3D";
import { NaveInterior, type NaveEscena } from "./NaveInterior";
import { PALETA, type Paleta } from "./paleta";

const COLS = 3;
const SEP_X = 13;
const SEP_Z = 12;

function posicion(i: number): [number, number, number] {
  const col = i % COLS;
  const fila = Math.floor(i / COLS);
  return [(col - (COLS - 1) / 2) * SEP_X, 0, (fila - 0.5) * SEP_Z];
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

function Calles({ p }: { p: Paleta }) {
  return (
    <group>
      <RoundedBox args={[44, 0.3, 30]} radius={0.2} position={[0, -0.32, 0]} receiveShadow>
        <Mat color={p.base} r={1} />
      </RoundedBox>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 0.14]} />
        <meshBasicMaterial color={p.linea} toneMapped={false} />
      </mesh>
      {[-SEP_X / 2, SEP_X / 2].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 26]} />
          <meshBasicMaterial color={p.linea} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Marcador rojo que flota sobre el taller del almacén con más equipos en taller. */
function Alerta({ p, i }: { p: Paleta; i: number }) {
  const ref = useRef<Group>(null);
  const [x, , z] = posicion(i);
  useFrame(({ clock }) => {
    if (ref.current && !p.quieto) ref.current.position.y = 3.4 + Math.sin(clock.elapsedTime * 2) * 0.18;
  });
  return (
    <group ref={ref} position={[x, 3.4, z + 2.9]}>
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

/** Zoom que deja ver las naves completas en el ancho disponible. */
const zoomBase = (ancho: number) => Math.max(8, Math.min(26, ancho / 56));

// Al cambiar la selección (o el ancho) lleva la cámara a la nave elegida o al conjunto, y se detiene:
// después el usuario puede girar y acercar a mano sin que la cámara regrese sola.
function Enfoque({ naves, seleccion }: { naves: NaveEscena[]; seleccion: string | null }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const ancho = useThree((s) => s.size.width);
  const meta = useMemo(() => new Vector3(), []);
  const animando = useRef(true);
  useEffect(() => { animando.current = true; }, [seleccion, ancho]);
  useFrame(() => {
    if (!controls || !animando.current) return;
    const i = naves.findIndex((n) => n.id === seleccion);
    if (i >= 0) {
      const [x, , z] = posicion(i);
      meta.set(x - 4, 0, z + 4);
    } else meta.set(-7, 0, 9);
    const zoom = i >= 0 ? zoomBase(ancho) * 1.6 : zoomBase(ancho);
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
function Proyector({ naves, refs }: { naves: NaveEscena[]; refs: React.RefObject<(HTMLButtonElement | null)[]> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    naves.forEach((_, i) => {
      const el = refs.current?.[i];
      if (!el) return;
      const [x, , z] = posicion(i);
      v.set(x, 3.6, z - 2.4).project(camera);
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    });
  });
  return null;
}

export default function Escena3D({ naves, seleccion, onSelect, onTaller, quieto }: {
  naves: NaveEscena[]; seleccion: string | null; onSelect: (id: string | null) => void; onTaller: (id: string) => void; quieto: boolean;
}) {
  const p: Paleta = { ...PALETA, quieto };
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [alta, setAlta] = useState(true);
  const peor = naves.reduce((a, n, i) => (n.paro > (naves[a]?.paro ?? -1) ? i : a), 0);

  return (
    <>
      <Canvas shadows dpr={alta ? [1, 2] : 1} gl={{ antialias: false }} onPointerMissed={() => onSelect(null)} aria-hidden="true">
        {/* Si el equipo no da los cuadros por segundo, se apagan los efectos caros y baja la resolución. */}
        <PerformanceMonitor onDecline={() => setAlta(false)} />
        <color attach="background" args={[p.fondo]} />
        <fog attach="fog" args={[p.fondo, 80, 170]} />
        {alta && <SoftShadows size={18} samples={10} focus={0.6} />}
        <OrthographicCamera makeDefault position={[27, 30, 43]} zoom={14} near={-100} far={300} />
        <OrbitControls makeDefault enablePan={false} enableZoom minZoom={8} maxZoom={40} minPolarAngle={Math.PI / 5} maxPolarAngle={Math.PI / 3} target={[-7, 0, 9]} />
        <ambientLight intensity={p.ambiente} />
        <hemisphereLight args={["#fff6e8", "#c9d3e2", 0.35]} />
        <directionalLight position={[16, 32, 22]} intensity={p.luz} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.02}
          shadow-camera-left={-32} shadow-camera-right={32} shadow-camera-top={32} shadow-camera-bottom={-32} />
        <directionalLight position={[-18, 14, -20]} intensity={0.35} color="#cfe0ff" />
        <Environment resolution={128} environmentIntensity={p.env}>
          <Lightformer intensity={2.5} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
          <Lightformer intensity={1.2} position={[-20, 4, 10]} rotation-y={Math.PI / 2} scale={[20, 6, 1]} />
          <Lightformer intensity={1.2} position={[20, 4, -10]} rotation-y={-Math.PI / 2} scale={[20, 6, 1]} />
        </Environment>
        <Calles p={p} />
        {naves.map((n, i) => (
          <group key={n.id} position={posicion(i)}>
            <NaveInterior nave={n} i={i} p={p} seleccionada={seleccion === n.id} onSelect={onSelect} onTaller={onTaller} />
          </group>
        ))}
        <Arbol p={p} posicion={[-21, 0, -13]} />
        <Arbol p={p} posicion={[-19.5, 0, -13.6]} s={0.7} />
        <Arbol p={p} posicion={[21, 0, 13]} />
        <Arbol p={p} posicion={[19.4, 0, 13.6]} s={0.8} />
        {naves[peor]?.paro > 0 && <Alerta p={p} i={peor} />}
        <Enfoque naves={naves} seleccion={seleccion} />
        <Proyector naves={naves} refs={refs} />
        {alta && (
          <EffectComposer multisampling={0} enableNormalPass={false}>
            <N8AO aoRadius={1.6} intensity={p.ao} distanceFalloff={0.6} quality="medium" halfRes />
            <Vignette offset={0.35} darkness={0.18} />
            <SMAA />
          </EffectComposer>
        )}
      </Canvas>
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {naves.map((n, i) => (
          <button key={n.id} ref={(el) => { refs.current[i] = el; }} type="button" onClick={() => onSelect(n.id)}
            className={`pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-2 whitespace-nowrap rounded-full border bg-white/85 py-1 pl-1 pr-3 text-[12px] font-medium text-tinta shadow-[0_4px_16px_rgb(0_0_0/0.08)] backdrop-blur-md hover:border-azul ${seleccion === n.id ? "border-azul" : i === peor && n.paro > 0 ? "border-paro/60" : "border-black/5"}`}>
            <span className={`h-5 w-5 rounded-full ring-[5px] ring-inset ring-white/85 ${n.paro > 0 ? "bg-paro" : "bg-ok"}`} aria-hidden="true" />
            <span>
              {i === peor && n.paro > 0 && <small className="block text-[10px] font-semibold leading-none text-paro-texto">Más equipos en taller</small>}
              {n.nombre} · {n.paro} en taller
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
