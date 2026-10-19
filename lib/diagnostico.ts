import "server-only";
import { createServiceClient } from "./supabase/server";

export type Diagnostico = { ok: boolean; lineas: { estado: "ok" | "mal" | "aviso"; texto: string }[] };

/** Revisa la llave de servicio SIN revelarla: forma, a qué proyecto pertenece y si Supabase la acepta. */
export async function diagnosticarLlave(): Promise<Diagnostico> {
  const lineas: Diagnostico["lineas"] = [];
  const crudo = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refUrl = url.match(/https:\/\/([a-z0-9]+)\./)?.[1];

  if (!crudo) return { ok: false, lineas: [{ estado: "mal", texto: "SUPABASE_SERVICE_ROLE_KEY no está configurada en este despliegue (falta agregarla o hacer Redeploy)." }] };
  const llave = crudo.trim();
  if (llave !== crudo) lineas.push({ estado: "mal", texto: "La llave tiene espacios o saltos de línea al inicio o al final." });
  if (/^["']|["']$/.test(llave)) lineas.push({ estado: "mal", texto: "La llave está entre comillas; pégala sin comillas." });
  lineas.push({ estado: "ok", texto: `Largo: ${llave.length} caracteres.` });

  if (llave.startsWith("sb_publishable_")) {
    lineas.push({ estado: "mal", texto: "Es la llave PÚBLICA (sb_publishable_…), no la de servicio." });
  } else if (llave.startsWith("sb_secret_")) {
    lineas.push({ estado: "ok", texto: "Formato: llave secreta nueva (sb_secret_…)." });
  } else if (llave.startsWith("eyJ")) {
    try {
      const datos = JSON.parse(Buffer.from(llave.split(".")[1], "base64url").toString("utf8")) as { role?: string; ref?: string };
      lineas.push({ estado: datos.role === "service_role" ? "ok" : "mal", texto: `Formato: JWT con rol "${datos.role ?? "?"}"${datos.role === "service_role" ? "" : " (debe ser service_role; parece la llave anon)"}.` });
      lineas.push({ estado: datos.ref === refUrl ? "ok" : "mal", texto: datos.ref === refUrl ? "Pertenece a este proyecto de Supabase." : `Es de OTRO proyecto (${datos.ref ?? "?"}); este es ${refUrl}.` });
    } catch {
      lineas.push({ estado: "mal", texto: "Empieza como JWT pero está incompleta o dañada (¿se cortó al copiar?)." });
    }
  } else {
    lineas.push({ estado: "mal", texto: "No tiene el formato de ninguna llave de Supabase (debe empezar con eyJ… o sb_secret_…)." });
  }

  try {
    const { error } = await createServiceClient().rpc("buscar_usuario_auth", { p_correo: "diagnostico@factory.invalid" });
    lineas.push(error ? { estado: "mal", texto: `Supabase la rechaza: ${error.message}` } : { estado: "ok", texto: "Supabase la acepta: invitar y crear usuarios funcionará." });
  } catch (e) {
    lineas.push({ estado: "mal", texto: `No se pudo probar: ${(e as Error).message}` });
  }
  return { ok: lineas.every((l) => l.estado !== "mal"), lineas };
}
