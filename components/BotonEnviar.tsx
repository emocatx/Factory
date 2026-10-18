"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío con estado de carga (ui-ux-pro-max: "Submit Feedback"). */
export function BotonEnviar({ children, pendiente = "Guardando…", className = "btn-primario" }: {
  children: React.ReactNode; pendiente?: string; className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending} aria-live="polite">
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending ? pendiente : children}
    </button>
  );
}
