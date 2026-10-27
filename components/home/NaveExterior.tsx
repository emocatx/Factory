"use client";

// Vista general: cada almacén como edificio cerrado (nave con techo, andenes y el taller anexo al
// frente). Todas las naves comparten geometría instanciada, así que dibujar 30 cuesta casi lo mismo
// que dibujar una. El techo del taller va en rojo si tiene equipos dentro, con una lámpara por equipo.
import { useMemo, useState } from "react";
import { Instance, Instances } from "@react-three/drei";
import { Mat } from "./Equipos3D";
import type { NaveEscena } from "./NaveInterior";
import type { Paleta } from "./paleta";

type V3 = [number, number, number];

/** Huella de la nave en la cuadrícula (la losa). */
export const HUELLA = { ancho: 11.4, fondo: 10.4 };
/** Centro del taller anexo respecto a la nave (ahí flota la alerta). */
export const ANEXO: V3 = [2.6, 0, 3.0];

const CUERPO = { ancho: 10, alto: 2.6, fondo: 6, z: -1.6 };
const FRENTE = CUERPO.z + CUERPO.fondo / 2;
const LAMPARAS = 6;

function Lote({ items, args, color, r = 0.6, m = 0, glow, sombra = true }: { items: V3[]; args: V3; color: string; r?: number; m?: number; glow?: boolean; sombra?: boolean }) {
  if (!items.length) return null;
  return (
    <Instances limit={items.length} castShadow={sombra} receiveShadow>
      <boxGeometry args={args} />
      <Mat color={color} r={r} m={m} glow={glow} />
      {items.map((q, k) => <Instance key={k} position={q} />)}
    </Instances>
  );
}

export function Exteriores({ naves, pos, p, seleccion, onSelect }: {
  naves: NaveEscena[]; pos: (i: number) => V3; p: Paleta; seleccion: string | null; onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const d = useMemo(() => {
    const r = {
      losas: [] as V3[], cuerpos: [] as V3[], bandas: [] as V3[], techos: [] as V3[], tragaluces: [] as V3[], clima: [] as V3[],
      puertas: [] as V3[], topes: [] as V3[], franjaOk: [] as V3[], franjaParo: [] as V3[],
      anexos: [] as V3[], techoAnexoOk: [] as V3[], techoAnexoParo: [] as V3[], puertasAnexo: [] as V3[], lamparas: [] as V3[], lineas: [] as V3[],
    };
    naves.forEach((n, i) => {
      const [x, , z] = pos(i);
      const a = (dx: number, y: number, dz: number): V3 => [x + dx, y, z + dz];
      r.losas.push(a(0, -0.1, 0));
      r.cuerpos.push(a(0, CUERPO.alto / 2, CUERPO.z));
      r.bandas.push(a(0, 0.4, CUERPO.z));
      r.techos.push(a(0, CUERPO.alto + 0.06, CUERPO.z));
      [-3, 0, 3].forEach((dx) => r.tragaluces.push(a(dx, CUERPO.alto + 0.13, CUERPO.z)));
      r.clima.push(a(-3.6, CUERPO.alto + 0.35, CUERPO.z - 1.8), a(-2.4, CUERPO.alto + 0.35, CUERPO.z - 1.8));
      [-3.6, -1.6].forEach((dx) => { r.puertas.push(a(dx, 0.85, FRENTE + 0.03)); r.topes.push(a(dx, 0.12, FRENTE + 0.12)); });
      (n.paro > 0 ? r.franjaParo : r.franjaOk).push(a(0, CUERPO.alto - 0.18, FRENTE + 0.04));
      r.anexos.push(a(ANEXO[0], 0.75, ANEXO[2]));
      (n.paro > 0 ? r.techoAnexoParo : r.techoAnexoOk).push(a(ANEXO[0], 1.55, ANEXO[2]));
      r.puertasAnexo.push(a(ANEXO[0], 0.6, ANEXO[2] + 1.23));
      for (let k = 0; k < Math.min(n.paro, LAMPARAS); k++) r.lamparas.push(a(ANEXO[0] - 1.5 + k * 0.6, 1.72, ANEXO[2]));
      [-4.2, -3.2, -2.2, -1.2].forEach((dx) => r.lineas.push(a(dx, 0.01, 3.2)));
    });
    return r;
  }, [naves, pos]);

  const iHover = hover ?? naves.findIndex((n) => n.id === seleccion);
  const ring = iHover >= 0 ? pos(iHover) : null;
  return (
    <group>
      <Lote items={d.losas} args={[HUELLA.ancho, 0.2, HUELLA.fondo]} color={p.piso} r={0.95} sombra={false} />
      {/* el cuerpo de la nave es el área para elegirla */}
      <Instances limit={naves.length} castShadow receiveShadow>
        <boxGeometry args={[CUERPO.ancho, CUERPO.alto, CUERPO.fondo]} />
        <Mat color={p.fachada} r={0.7} />
        {d.cuerpos.map((q, k) => (
          <Instance key={k} position={q}
            onPointerOver={(e) => { e.stopPropagation(); setHover(k); document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { setHover(null); document.body.style.cursor = ""; }}
            onClick={(e) => { e.stopPropagation(); onSelect(naves[k].id); }} />
        ))}
      </Instances>
      <Lote items={d.bandas} args={[CUERPO.ancho + 0.02, 0.8, CUERPO.fondo + 0.02]} color={p.banda} r={0.6} sombra={false} />
      <Lote items={d.techos} args={[CUERPO.ancho + 0.3, 0.12, CUERPO.fondo + 0.3]} color={p.techo} r={0.8} />
      <Lote items={d.tragaluces} args={[1.6, 0.04, CUERPO.fondo - 1.2]} color={p.oscuro ? "#3a5a66" : "#dfe9f5"} r={0.15} m={0.2} sombra={false} />
      <Lote items={d.clima} args={[0.9, 0.5, 0.9]} color={p.estructuraClara} r={0.5} m={0.3} />
      <Lote items={d.puertas} args={[1.5, 1.7, 0.06]} color={p.estructura} r={0.5} m={0.3} sombra={false} />
      <Lote items={d.topes} args={[1.6, 0.24, 0.16]} color={p.amarillo} r={0.6} sombra={false} />
      <Lote items={d.franjaOk} args={[CUERPO.ancho - 0.4, 0.12, 0.04]} color={p.ok} glow sombra={false} />
      <Lote items={d.franjaParo} args={[CUERPO.ancho - 0.4, 0.12, 0.04]} color={p.paro} glow sombra={false} />
      <Lote items={d.anexos} args={[4.2, 1.5, 2.4]} color={p.fachada} r={0.7} />
      <Lote items={d.techoAnexoOk} args={[4.4, 0.1, 2.6]} color={p.techo} r={0.8} />
      <Lote items={d.techoAnexoParo} args={[4.4, 0.1, 2.6]} color={p.paro} r={0.6} />
      <Lote items={d.puertasAnexo} args={[1.8, 1.2, 0.06]} color={p.estructura} r={0.5} m={0.3} sombra={false} />
      <Lote items={d.lamparas} args={[0.26, 0.2, 0.26]} color={p.paro} glow sombra={false} />
      <Lote items={d.lineas} args={[0.06, 0.01, 1.6]} color={p.amarillo} sombra={false} />
      {ring && (
        <mesh position={[ring[0], 0.02, ring[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7.2, 7.35, 4, 1, Math.PI / 4]} />
          <meshBasicMaterial color={p.sel} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
