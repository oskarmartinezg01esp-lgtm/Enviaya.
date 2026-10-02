import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CORTANA · Pedidos por voz",
    short_name: "CORTANA",
    description: "Haz tus pedidos hablando con CORTANA.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05070D",
    theme_color: "#05070D",
    lang: "es-ES",
    categories: ["food", "shopping", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hablar con CORTANA", url: "/?voice=1" },
      { name: "Mis pedidos", url: "/pedidos" },
    ],
  };
}
