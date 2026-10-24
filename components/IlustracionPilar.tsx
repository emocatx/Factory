import type { Pilar } from "@/lib/tipos";

/**
 * Ilustraciones planas de cada pilar, dibujadas en código (tinta + acento sobre panel),
 * recortadas con el perfil de diente de sierra. Sustituyen fotografías mientras no haya propias.
 */
const DIBUJOS: Record<Pilar, React.ReactNode> = {
  // Montacargas
  moviles: (
    <g>
      <rect x="60" y="150" width="440" height="10" fill="#1d1d1f" />
      <rect x="300" y="40" width="10" height="112" fill="#1d1d1f" />
      <rect x="318" y="40" width="10" height="112" fill="#1d1d1f" />
      <rect x="328" y="130" width="70" height="8" fill="#1d1d1f" />
      <rect x="328" y="96" width="62" height="34" fill="#f2a900" />
      <path d="M170 150 V96 h38 l34 -38 h40 v92 Z" fill="#1d1d1f" />
      <rect x="212" y="66" width="38" height="30" fill="var(--hueco, #ffffff)" />
      <rect x="140" y="104" width="34" height="46" fill="#1d1d1f" />
      <circle cx="196" cy="152" r="20" fill="#1d1d1f" /><circle cx="196" cy="152" r="7" fill="var(--hueco, #ffffff)" />
      <circle cx="270" cy="152" r="16" fill="#1d1d1f" /><circle cx="270" cy="152" r="5" fill="var(--hueco, #ffffff)" />
    </g>
  ),
  // Transportador con cajas
  dorsales: (
    <g>
      <rect x="30" y="112" width="500" height="14" rx="7" fill="#1d1d1f" />
      {Array.from({ length: 11 }, (_, i) => <circle key={i} cx={52 + i * 46} cy="119" r="4" fill="var(--hueco, #ffffff)" />)}
      {[70, 150, 300, 380].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 72 : 80} width={i % 2 ? 54 : 46} height={i % 2 ? 40 : 32} fill={i === 2 ? "#f2a900" : "#1d1d1f"} />
      ))}
      <rect x="80" y="126" width="8" height="38" fill="#1d1d1f" />
      <rect x="470" y="126" width="8" height="38" fill="#1d1d1f" />
      <rect x="275" y="126" width="8" height="38" fill="#1d1d1f" />
    </g>
  ),
  // Tablero eléctrico / planta de emergencia
  criticos: (
    <g>
      <rect x="150" y="44" width="260" height="120" fill="#1d1d1f" />
      <rect x="170" y="64" width="90" height="56" fill="var(--hueco, #ffffff)" />
      <path d="M215 70 l-16 26 h14 l-8 20 22 -30 h-14 l10 -16 Z" fill="#f2a900" />
      {[0, 1, 2].map((i) => <circle key={i} cx={300 + i * 32} cy="86" r="11" fill="#f2a900" opacity={1 - i * 0.3} />)}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={170 + i * 56} y="134" width="40" height="8" fill="var(--hueco, #ffffff)" />)}
      <rect x="160" y="164" width="12" height="8" fill="#1d1d1f" /><rect x="388" y="164" width="12" height="8" fill="#1d1d1f" />
    </g>
  ),
  // Fachada de nave con andenes
  infraestructura: (
    <g>
      <rect x="80" y="70" width="400" height="100" fill="#1d1d1f" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={104 + i * 92} y="100" width="64" height="70" fill="var(--hueco, #ffffff)" />
          {Array.from({ length: 6 }, (_, j) => <rect key={j} x={104 + i * 92} y={104 + j * 11} width="64" height="4" fill="#c8c9c4" />)}
        </g>
      ))}
      <rect x="104" y="80" width="340" height="8" fill="#f2a900" />
    </g>
  ),
};

/** Ilustración grande (al pie de la tarjeta del pilar). */
export function IlustracionPilar({ pilar, className = "" }: { pilar: Pilar; className?: string }) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox="0 0 560 190" className="absolute inset-x-0 bottom-0 h-full w-full" preserveAspectRatio="xMidYMax meet">
        {DIBUJOS[pilar]}
      </svg>
    </div>
  );
}

/** Miniatura para la tira de pilares (recorta el dibujo a su contenido). */
export function MiniPilar({ pilar, ancho = 96, alto = 44, hueco = "var(--color-papel)" }: { pilar: Pilar; ancho?: number; alto?: number; hueco?: string }) {
  return (
    <svg viewBox="20 10 520 180" width={ancho} height={alto} aria-hidden="true" style={{ ["--hueco" as string]: hueco }}>
      {DIBUJOS[pilar]}
    </svg>
  );
}
