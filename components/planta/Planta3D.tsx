"use client";

// Prototipo de la plantilla de nave (/prueba-planta): la nave de Nave.tsx en su propio lienzo, con medidor.
// Escala real en metros. Se dibuja a pedido como el Resumen (ver components/home/Movimiento.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Vector3 } from "three";
import { Environment, Lightformer, OrbitControls, OrthographicCamera } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PALETA, PALETA_OSCURA, type Paleta } from "@/components/home/paleta";
import { Depurar } from "@/components/home/Depurar";
import { Calidad, Movimiento } from "@/components/home/Movimiento";
import { CapaMarcas, marcasDe, Nave, ProyectorMarcas, type Vista } from "./Nave";
import type { Distribucion } from "./ficha";

export type { Vista } from "./Nave";

// ── Cámara y medidor ──────────────────────────────────────────────────────────────────────────────
function Encuadre({ d, clave }: { d: Distribucion; clave: string }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
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
    invalidate();
  }, [controls, d, clave, width, height, invalidate]);
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
      <Canvas frameloop="demand" shadows={alta} dpr={alta ? [1, 1.75] : 1} gl={{ antialias: false }} aria-hidden="true">
        <Movimiento quieto={false} clave={clave}>
          <Calidad onBaja={() => setAlta(false)} />
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
          <Nave d={d} p={p} vista={vista} />
          <Encuadre d={d} clave={clave} />
          <Medidor onMedir={onMedir} />
          {process.env.NODE_ENV !== "production" && <Depurar />}
          <ProyectorMarcas marcas={marcas} refs={refs} d={d} />
          {alta && (
            <EffectComposer multisampling={0} enableNormalPass={false}>
              <N8AO aoRadius={3} intensity={oscuro ? 2.6 : 1.8} distanceFalloff={0.8} quality="performance" halfRes />
              <SMAA />
            </EffectComposer>
          )}
        </Movimiento>
      </Canvas>
      <CapaMarcas marcas={marcas} refs={refs} />
    </>
  );
}
