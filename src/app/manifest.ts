import type { MetadataRoute } from "next";

/**
 * PWA manifest (#340). display: standalone is provisional pending the
 * post-deploy physical-iPhone auth verification (#341); the evidence-driven
 * fallback is display: "browser" if standalone reauthentication fails.
 * No service worker by design: this is a live, DB-backed financial dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    scope: "/",
    name: "KapMan Trading Journal",
    short_name: "KapMan",
    description: "Trading journal: imports, FIFO lots, live NLV, and setup analytics.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#08090c",
    theme_color: "#12151c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
