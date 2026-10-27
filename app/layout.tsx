import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Factory", template: "%s · Factory" },
  description: "Seguimiento de fallas y control de activos — Anacronyc y JRia",
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f5f7" }, { media: "(prefers-color-scheme: dark)", color: "#0b0c0d" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Modo oscuro: lo elige cada usuario en su menú (cookie "tema"); por defecto, claro.
  const tema = (await cookies()).get("tema")?.value === "oscuro" ? "oscuro" : "claro";
  return (
    <html lang="es-MX" data-tema={tema} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
