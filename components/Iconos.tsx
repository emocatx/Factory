const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconoReloj = () => <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IconoPulso = () => <svg {...base}><path d="M3 12h4l3 -7 4 14 3 -7h4" /></svg>;
export const IconoNave = () => <svg {...base}><path d="M3 20V10l6-4v4l6-4v4l6-4v14z" /></svg>;
export const IconoLlave = () => <svg {...base}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>;

const chico = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const IcoCalendario = () => <svg {...chico}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
export const IcoFiltro = () => <svg {...chico}><path d="M4 5h16l-6 8v5l-4 2v-7z" /></svg>;
export const IcoEquipo = () => <svg {...chico}><path d="M3 17h11V9H9l-3 4H3z" /><path d="M16 5v12M19 5v12M19 15h3" /><circle cx="6.5" cy="18" r="2" /><circle cx="12" cy="18" r="2" /></svg>;
export const IcoAlmacen = () => <svg {...chico}><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-7h10v7M7 17h10" /></svg>;
export const IcoAlerta = () => <svg {...chico}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>;
export const IcoPersona = () => <svg {...chico}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
export const IcoCapas = () => <svg {...chico}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>;
