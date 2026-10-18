import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLICAS = ["/login", "/auth"];

/** Página legible cuando el despliegue no tiene configuradas las variables de Supabase. */
function faltaConfiguracion(faltan: string[]) {
  const lista = faltan.map((v) => `<li><code>${v}</code></li>`).join("");
  return new NextResponse(
    `<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factory · Falta configuración</title>
<body style="margin:0;font:16px/1.5 -apple-system,Segoe UI,system-ui,sans-serif;background:#f5f5f7;color:#1d1d1f;display:grid;place-items:center;min-height:100vh;padding:16px">
<main style="background:#fff;border-radius:24px;padding:32px;max-width:520px">
<h1 style="margin:0 0 8px;font-size:28px;letter-spacing:-.02em">Falta configurar Factory</h1>
<p style="color:#6e6e73;margin:0 0 16px">Este despliegue no tiene las variables de entorno de Supabase. Agrégalas en Vercel → Settings → Environment Variables y vuelve a desplegar:</p>
<ul>${lista}</ul></main></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const faltan = [!url && "NEXT_PUBLIC_SUPABASE_URL", !llave && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean) as string[];
  if (faltan.length) return faltaConfiguracion(faltan);

  const supabase = createServerClient(
    url!,
    llave!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Si Supabase no responde, se trata como sesión no iniciada en lugar de tumbar la página.
  let user = null;
  try {
    user = (await supabase.auth.getUser()).data.user;
  } catch {
    user = null;
  }

  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta.startsWith(p));

  if (!user && !esPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", ruta);
    return NextResponse.redirect(url);
  }
  if (user && ruta === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
