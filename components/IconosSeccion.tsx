/**
 * Iconos de línea para la tira de secciones de cada pilar (trazo azul, como las ilustraciones de
 * servicio de una tienda de producto). 56×44, sin relleno salvo un acento.
 */
const p = { fill: "none", stroke: "var(--color-azul)", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const DIBUJOS: Record<string, React.ReactNode> = {
  ordenes: (<g {...p}><rect x="14" y="6" width="28" height="34" rx="4" /><path d="M22 6v-2h12v2" /><path d="M20 17h16M20 24h16M20 31h10" /></g>),
  seguimiento: (<g {...p}><rect x="10" y="8" width="36" height="28" rx="4" /><path d="M10 16h36" /><circle cx="22" cy="27" r="4" /><path d="M30 25h10M30 30h6" /></g>),
  resumen: (<g {...p}><path d="M8 38h40" /><rect x="12" y="22" width="7" height="16" rx="1.5" /><rect x="24.5" y="12" width="7" height="26" rx="1.5" /><rect x="37" y="17" width="7" height="21" rx="1.5" /></g>),
  registro: (<g {...p}><rect x="12" y="6" width="26" height="34" rx="4" /><path d="M18 15h14M18 22h10" /><circle cx="40" cy="32" r="8" fill="var(--color-panel)" /><path d="M40 28v8M36 32h8" /></g>),
  indicadores: (<g {...p}><path d="M10 34a18 18 0 0 1 36 0" /><path d="M28 34l9-11" /><circle cx="28" cy="34" r="2.5" /><path d="M14 34h3M39 34h3M28 16v3" /></g>),
  analisis: (<g {...p}><rect x="9" y="12" width="7" height="26" rx="1.5" /><rect x="20" y="20" width="7" height="18" rx="1.5" /><rect x="31" y="27" width="7" height="11" rx="1.5" /><path d="M8 10c10 0 20 4 26 10s8 10 14 10" /></g>),
  cerradas: (<g {...p}><rect x="12" y="6" width="28" height="34" rx="4" /><path d="M19 24l5 5 10-11" /></g>),
  planes: (<g {...p}><rect x="10" y="9" width="36" height="31" rx="4" /><path d="M10 18h36M19 5v8M37 5v8" /><path d="M19 29l4 4 9-9" /></g>),
  historial: (<g {...p}><circle cx="28" cy="23" r="15" /><path d="M28 14v9l6 4" /><path d="M10 12l3 5 5-3" /></g>),
  configuracion: (<g {...p}><circle cx="28" cy="23" r="6" /><path d="M28 7v5M28 34v5M12 23h5M39 23h5M16.7 11.7l3.5 3.5M35.8 30.8l3.5 3.5M16.7 34.3l3.5-3.5M35.8 15.2l3.5-3.5" /></g>),
  usuarios: (<g {...p}><circle cx="22" cy="17" r="6" /><path d="M10 37c1.5-7 6.5-10 12-10s10.5 3 12 10" /><circle cx="37" cy="15" r="4.5" /><path d="M36 25c5 0 8.5 2.5 10 8" /></g>),
  equipos: (<g {...p}><path d="M8 34h20V18h-8l-6 8H8z" /><path d="M32 8v28M37 8v28M37 30h9" /><circle cx="14" cy="36" r="3.5" fill="var(--color-panel)" /><circle cx="25" cy="36" r="3.5" fill="var(--color-panel)" /></g>),
};

/** `chico`: versión discreta para la barra lateral (gris, toma el color del texto). */
export function IconoSeccion({ clave, chico }: { clave: string; chico?: boolean }) {
  return (
    <svg viewBox="0 0 56 44" width={chico ? 26 : 56} height={chico ? 20 : 44} aria-hidden="true"
      className={chico ? "[&_*]:[stroke:currentColor] [&_*]:[stroke-width:2.6]" : undefined}>
      {DIBUJOS[clave] ?? DIBUJOS.ordenes}
    </svg>
  );
}
