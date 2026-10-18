const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconoReloj = () => <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IconoPulso = () => <svg {...base}><path d="M3 12h4l3 -7 4 14 3 -7h4" /></svg>;
export const IconoNave = () => <svg {...base}><path d="M3 20V10l6-4v4l6-4v4l6-4v14z" /></svg>;
export const IconoLlave = () => <svg {...base}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>;
