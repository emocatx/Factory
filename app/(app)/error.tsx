"use client";



export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="caja-panel mx-auto mt-16 max-w-md p-8 text-center">
      
      <h1 className="mt-4 text-[28px] font-semibold">No pudimos cargar esta vista</h1>
      <p className="mt-2 text-[15px] text-suave">
        Revisa tu conexión e inténtalo de nuevo. Si persiste, comparte este código con soporte:{" "}
        <span className="font-mono">{error.digest ?? "sin código"}</span>
      </p>
      <button className="btn-primario mt-6" onClick={reset}>Reintentar</button>
    </div>
  );
}
