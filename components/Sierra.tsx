/**
 * El motivo de Factory: el techo de diente de sierra de una nave de CEDIS
 * (pendiente que sube y caída vertical). Una sola geometría a varias escalas:
 * banda grande, recorte de ilustraciones, viñeta de listas y separador.
 */

/** Ruta SVG de un techo de sierra con `dientes` dientes en una caja W×H. */
export function rutaSierra(dientes: number, W = 100, H = 100, alturaDiente = 0.32) {
  const paso = W / dientes;
  const h = H * alturaDiente;
  let d = `M0 ${H} L0 ${h}`;
  for (let i = 1; i <= dientes; i++) d += ` L${i * paso} 0 L${i * paso} ${h}`;
  return `${d} L${W} ${H} Z`;
}

/** clip-path CSS con el mismo perfil (para recortar ilustraciones). */
export function clipSierra(dientes = 5, alturaPct = 16) {
  const paso = 100 / dientes;
  const pts = ["0% 100%", `0% ${alturaPct}%`];
  for (let i = 1; i <= dientes; i++) pts.push(`${(i * paso).toFixed(2)}% 0%`, `${(i * paso).toFixed(2)}% ${alturaPct}%`);
  pts.push("100% 100%");
  return `polygon(${pts.join(", ")})`;
}

/** Banda de dientes (separador / motivo a gran escala). */
export function BandaSierra({ dientes = 12, className = "", color = "var(--color-motivo)" }: { dientes?: number; className?: string; color?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${dientes * 40} 40`} preserveAspectRatio="none" aria-hidden="true">
      <path d={rutaSierra(dientes, dientes * 40, 40, 1)} fill={color} />
    </svg>
  );
}

/** Un solo diente: viñeta de listas. */
export function Diente({ className = "", color = "var(--color-motivo)" }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M0 12 L0 6 L12 0 L12 12 Z" fill={color} />
    </svg>
  );
}
