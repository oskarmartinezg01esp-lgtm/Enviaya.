import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/layout/service-worker";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CORTANA · Pedidos por voz", template: "%s · CORTANA" },
  description: "Habla con CORTANA para buscar productos, hacer tu pedido, confirmarlo y seguirlo en tiempo real.",
  applicationName: "CORTANA",
  appleWebApp: { capable: true, title: "CORTANA", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#05070D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${sora.variable}`}>
      <body className="ambient min-h-dvh">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{ classNames: { toast: "!bg-[#0B111C]/95 !border !border-white/10 !text-white !backdrop-blur-xl" } }}
        />
        <ServiceWorker />
      </body>
    </html>
  );
}
