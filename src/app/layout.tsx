import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/trpc/react";
import { SwRegister } from "@/components/SwRegister";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Notiono",
  description: "Tu espacio: notas, bases de datos y gráficas reales. Self-hosted.",
  appleWebApp: { capable: true, title: "Notiono", statusBarStyle: "default" },
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff5c28",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body
        className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
      >
        <SwRegister />
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
