import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces de correo (confirmación de alta e invitaciones).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const destino = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=enlace", url.origin));
  const final = type === "invite" || type === "recovery" ? "/auth/contrasena" : destino;
  return NextResponse.redirect(new URL(final, url.origin));
}
