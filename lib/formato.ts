const TZ_DEF = "America/Mexico_City";

export function fechaHora(iso: string | null | undefined, tz = TZ_DEF) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function horas(h: number | null | undefined) {
  if (h === null || h === undefined) return "—";
  const n = Number(h);
  if (n < 1) return `${Math.round(n * 60)} min`;
  if (n < 48) return `${n.toFixed(1)} h`;
  return `${(n / 24).toFixed(1)} días`;
}

export function pct(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(1)}%`;
}

/** Valor por defecto para <input type="datetime-local"> en hora local del navegador */
export function ahoraLocalInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
