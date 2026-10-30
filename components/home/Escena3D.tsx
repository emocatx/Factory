"use client";

// Escena 3D del home de Móviles (react-three-fiber). Se carga solo en escritorio y con carga diferida
// (ver HomeMoviles): en celular no se descarga ni un byte de Three.js.
// Vista general: todos los almacenes como edificios cerrados (geometría instanciada, muy ligera).
// Al elegir uno se dibuja solo ese, por dentro, ampliado y con todos sus equipos.
// Se dibuja a pedido (ver Movimiento.tsx): en reposo no gasta tarjeta gráfica.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import { Environment, Lightformer, OrbitControls, OrthographicCamera, RoundedBox, SoftShadows } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Mat } from "./Equipos3D";
import { medidas, NaveInterior, type NaveEscena } from "./NaveInterior";
import { ANEXO, Exteriores } from "./NaveExterior";
import { PALETA, PALETA_OSCURA, type Paleta } from "./paleta";
import { Depurar } from "./Depurar";
import { Calidad, Movimiento, useReloj } from "./Movimiento";
import { tipoDeModelo } from "./Equipos3D";
import { CapaMarcas, marcasDe, Nave, ProyectorMarcas } from "@/components/planta/Nave";
import { distribuir, fichaDeAlmacen, type Distribucion, type EquipoFlota } from "@/components/planta/ficha";

/** La plantilla mide en metros; en esta escena 1 unidad = 4 m (así cabe con el mismo encuadre y luces). */
const ESCALA_PLANTA = 0.25;

/**
 * Compila de antemano, en segundo plano, los sombreadores de la plantilla: una nave de muestra fuera de la escena
 * (no se dibuja) pasada por compileAsync. Mientras viva, sus materiales mantienen esos programas, así entrar a un
 * almacén con ficha no congela la escena compilando (y salir y volver a entrar tampoco).
 */
function Precalentar({ d, p }: { d: Distribucion; p: Paleta }) {
  const grupo = useMemo(() => new Group(), []);
  const { gl, camera, scene } = useThree();
  const [montar, setMontar] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMontar(true), 1200); return () => clearTimeout(id); }, []);
  useEffect(() => {
    if (!montar) return;
    const id = requestAnimationFrame(() => { gl.compileAsync(grupo, camera, scene).catch(() => {}); });
    return () => cancelAnimationFrame(id);
  }, [montar, gl, camera, scene, grupo]);
  return montar ? createPortal(<Nave d={d} p={p} vista="moviles" escala={ESCALA_PLANTA} patio={false} />, grupo) : null;
}

/** Los equipos reales del almacén: tipo según su modelo; rojo en Mantto, ámbar renta, verde opera. */
function flotaDe(n: NaveEscena): EquipoFlota[] {
  return [
    ...n.detenidos.map((m): EquipoFlota => ({ tipo: tipoDeModelo(m), estado: "paro" })),
    ...n.operando.map(([m, renta]): EquipoFlota => ({ tipo: tipoDeModelo(m), estado: renta ? "renta" : "ok" })),
  ];
}

const SEP_X = 13;
const SEP_Z = 12;
/** Espacio que ocupan los paneles fijos sobre la escena (izquierda y franjas de arriba y abajo). */
const PANEL_IZQ = 360;
const FRANJAS_ALTO = 280;
/** Offset de la cámara respecto a su objetivo (vista isométrica). */
const OFFSET_CAMARA: [number, number, number] = [34, 30, 34];

type V3 = [number, number, number];
type Malla = { cols: number; filas: number; ancho: number; fondo: number };

function malla(n: number): Malla {
  const cols = n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : Math.ceil(Math.sqrt(n * 1.4));
  const filas = Math.max(1, Math.ceil(n / cols));
  return { cols, filas, ancho: cols * SEP_X, fondo: filas * SEP_Z };
}

function posicion(i: number, m: Malla): V3 {
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

/** Marcador rojo que flota sobre el taller del almacén con más equipos en Mantto. */
function Alerta({ p, pos }: { p: Paleta; pos: [number, number, number] }) {
  const ref = useRef<Group>(null);
  const reloj = useReloj();
  useFrame(() => {
    if (ref.current && !p.quieto && reloj.vivo) ref.current.position.y = 3.4 + Math.sin(reloj.t * 2) * 0.18;
  });
  return (
    <group ref={ref} position={[pos[0] + ANEXO[0], 3.4, pos[2] + ANEXO[2]]}>
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

// Al cambiar lo que se ve (o el tamaño) encuadra la escena y se detiene: después el usuario puede
// girar y acercar a mano sin que la cámara regrese sola. Con "reducir movimiento" salta sin transición.
function Enfoque({ w, d, clave, quieto }: { w: number; d: number; clave: string; quieto: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const { width: ancho, height: alto } = useThree((s) => s.size);
  const meta = useMemo(() => new Vector3(), []);
  const animando = useRef(true);
  useEffect(() => { animando.current = true; invalidate(); }, [clave, ancho, alto, controls, invalidate]);
  useFrame(() => {
    if (!controls || !animando.current) return;
    const zoom = Math.min(34, zoomPara(ancho, alto, w, d));
    objetivo(0, 0, zoom, meta);
    const k = quieto ? 1 : 0.1;
    const cam = controls.object as unknown as { zoom: number; position: Vector3; updateProjectionMatrix: () => void };
    cam.zoom += (zoom - cam.zoom) * k;
    cam.updateProjectionMatrix();
    const antes = controls.target.clone();
    controls.target.lerp(meta, k);
    cam.position.add(controls.target.clone().sub(antes));
    controls.update();
    if (Math.abs(cam.zoom - zoom) < 0.02 && controls.target.distanceTo(meta) < 0.01) animando.current = false;
    else invalidate();
  });
  return null;
}

// Etiquetas HTML sobre cada nave, proyectando su punto 3D a la pantalla.
// (Se evita <Html> de drei: con React 19 a veces desmonta la primera etiqueta.)
// Con muchos almacenes, en la vista general solo llevan etiqueta los que tienen equipos en Mantto;
// los demás la muestran al acercarse o al elegirlos (si no, se enciman).
const ZOOM_ETIQUETAS = 16;

function Proyector({ naves, refs, punto, seleccion }: { naves: NaveEscena[]; refs: React.RefObject<(HTMLButtonElement | null)[]>; punto: (i: number) => V3; seleccion: string | null }) {
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
      v.set(...punto(i)).project(camera);
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
  // con un almacén elegido la escena es solo esa nave, del tamaño que pidan sus equipos
  const unica = seleccion ? naves.find((n) => n.id === seleccion) ?? null : null;
  // si el almacén tiene ficha, su nave se arma con la plantilla y sus equipos reales; si no, el interior genérico
  const plantilla = useMemo(() => {
    const f = unica ? fichaDeAlmacen(unica) : null;
    return f && unica ? distribuir(f, flotaDe(unica)) : null;
  }, [unica]);
  const marcas = useMemo(() => (plantilla ? marcasDe(plantilla, "moviles") : []), [plantilla]);
  // la primera nave con ficha que se vea sirve de muestra para precalentar (se queda fija)
  const [muestra, setMuestra] = useState<Distribucion | null>(null);
  useEffect(() => {
    if (muestra) return;
    const n = naves.find((x) => fichaDeAlmacen(x));
    const f = n ? fichaDeAlmacen(n) : null;
    if (n && f) setMuestra(distribuir(f, flotaDe(n)));
  }, [naves, muestra]);
  const refsMarcas = useRef<(HTMLSpanElement | null)[]>([]);
  const dims = plantilla ? { ancho: plantilla.huella.ancho * ESCALA_PLANTA, fondo: plantilla.huella.fondo * ESCALA_PLANTA } : unica ? medidas(unica) : null;
  const m = useMemo<Malla>(() => dims ? { cols: 1, filas: 1, ancho: dims.ancho, fondo: dims.fondo } : malla(naves.length),
    [dims?.ancho, dims?.fondo, naves.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useCallback((i: number) => posicion(i, m), [m]);
  const punto = useCallback((i: number): V3 => unica ? [0, 3.6, -m.fondo / 2 + 1] : [pos(i)[0], 3.6, pos(i)[2] - 2.4], [unica, m, pos]);
  const peor = naves.reduce((a, n, i) => (n.paro > (naves[a]?.paro ?? -1) ? i : a), 0);
  const sombra = Math.max(m.ancho, m.fondo) / 2 + 6;
  const esquina: [number, number, number] = [-m.ancho / 2 - 1.5, 0, -m.fondo / 2 - 2];
  const esquina2: [number, number, number] = [m.ancho / 2 + 1.5, 0, m.fondo / 2 + 2];

  return (
    <>
      <Canvas frameloop="demand" shadows={alta} dpr={alta ? [1, 1.75] : 1} gl={{ antialias: false }} onPointerMissed={() => onSelect(null)} aria-hidden="true">
        <Movimiento quieto={quieto} clave={seleccion ?? ""}>
        {/* Si el equipo no da los cuadros por segundo, se apagan sombras y efectos y baja la resolución. */}
        <Calidad onBaja={() => setAlta(false)} />
        <color attach="background" args={[p.fondo]} />
        {/* fijo en ambas vistas: encender o apagar SoftShadows recompila todos los shaders (congela la escena) */}
        {alta && <SoftShadows size={18} samples={8} focus={0.6} />}
        <OrthographicCamera makeDefault position={OFFSET_CAMARA} zoom={10} near={-300} far={600} />
        <OrbitControls makeDefault enablePan={false} enableZoom minZoom={3} maxZoom={48} minPolarAngle={Math.PI / 5} maxPolarAngle={Math.PI / 3} target={[0, 0, 0]} />
        <ambientLight intensity={p.ambiente} />
        <hemisphereLight args={oscuro ? ["#d3dbe0", "#0a0d10", 0.35] : ["#fff6e8", "#c9d3e2", 0.35]} />
        <directionalLight position={[16, 32, 22]} intensity={p.luz} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.02}
          shadow-camera-left={-sombra} shadow-camera-right={sombra} shadow-camera-top={sombra} shadow-camera-bottom={-sombra} shadow-camera-far={200} />
        <directionalLight position={[-18, 14, -20]} intensity={oscuro ? 0.5 : 0.35} color={oscuro ? "#8aa3b8" : "#cfe0ff"} />
        <Environment resolution={128} environmentIntensity={p.env}>
          <Lightformer intensity={2.5} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[30, 30, 1]} />
          <Lightformer intensity={1.2} position={[-20, 4, 10]} rotation-y={Math.PI / 2} scale={[20, 6, 1]} />
          <Lightformer intensity={1.2} position={[20, 4, -10]} rotation-y={-Math.PI / 2} scale={[20, 6, 1]} />
        </Environment>
        <Calles p={p} m={m} />
        {unica && plantilla
          ? <Nave d={plantilla} p={p} vista="moviles" escala={ESCALA_PLANTA} patio={false} onTaller={() => onTaller(unica.id)} />
          : unica
            ? <NaveInterior nave={unica} i={0} p={p} onTaller={onTaller} />
            : <Exteriores naves={naves} pos={pos} p={p} seleccion={seleccion} onSelect={onSelect} />}
        {plantilla && <ProyectorMarcas marcas={marcas} refs={refsMarcas} d={plantilla} escala={ESCALA_PLANTA} />}
        {muestra && alta && <Precalentar d={muestra} p={p} />}
        <Arbol p={p} posicion={esquina} />
        <Arbol p={p} posicion={[esquina[0] + 1.5, 0, esquina[2] - 0.6]} s={0.7} />
        <Arbol p={p} posicion={esquina2} />
        <Arbol p={p} posicion={[esquina2[0] - 1.6, 0, esquina2[2] + 0.6]} s={0.8} />
        {!unica && naves[peor]?.paro > 0 && <Alerta p={p} pos={pos(peor)} />}
        <Enfoque w={m.ancho} d={m.fondo} clave={seleccion ?? ""} quieto={quieto} />
        <Proyector naves={naves} refs={refs} punto={punto} seleccion={seleccion} />
        {process.env.NODE_ENV !== "production" && <Depurar />}
        {alta && (
          <EffectComposer multisampling={0} enableNormalPass={false}>
            {/* en la plantilla 1 unidad son 4 m: el radio de oclusión baja a 3 m, como en el prototipo */}
            <N8AO aoRadius={plantilla ? 0.75 : 1.6} intensity={p.ao} distanceFalloff={plantilla ? 0.8 : 0.6} quality="medium" halfRes />
            <Vignette offset={0.35} darkness={oscuro ? 0.5 : 0.18} />
            <SMAA />
          </EffectComposer>
        )}
        </Movimiento>
      </Canvas>
      {/* Sin desenfoque de fondo: con 30 etiquetas que se mueven con la cámara, el desenfoque bajaba el giro a
          57 cuadros por segundo; con el fondo casi opaco de vidrio-fuerte no se nota la diferencia. */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {naves.map((n, i) => (
          <button key={n.id} ref={(el) => { refs.current[i] = el; }} type="button" onClick={() => onSelect(n.id)}
            className={`pointer-events-auto absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-vidrio-fuerte py-0.5 pl-0.5 pr-2.5 font-medium text-tinta shadow-[0_4px_16px_rgb(0_0_0/0.08)] hover:z-10 hover:border-azul ${n.paro > 0 ? "text-[12px]" : "text-[11px] text-suave"} ${seleccion === n.id ? "z-10 border-azul" : i === peor && n.paro > 0 ? "border-paro/60" : "border-borde/50"}`}>
            <span className={`rounded-full ring-inset ring-panel ${n.paro > 0 ? "h-5 w-5 bg-paro ring-[5px]" : "h-4 w-4 bg-ok ring-[4px]"}`} aria-hidden="true" />
            <span>
              {i === peor && n.paro > 0 && <small className="block text-[10px] font-semibold leading-none text-paro-texto">Más equipos en Mantto</small>}
              {n.nombre}{n.paro > 0 ? ` · ${n.paro} en Mantto` : ""}
            </span>
          </button>
        ))}
      </div>
      {plantilla && <CapaMarcas marcas={marcas} refs={refsMarcas} />}
    </>
  );
}
