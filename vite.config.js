import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base: "./" makes built asset paths relative, so the app works whether it's
// served from a domain root or a GitHub Pages project subpath (/<repo>/).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // We already hand-maintain public/manifest.webmanifest and its <link>
      // in index.html — let the plugin only handle the service worker.
      manifest: false,
      injectRegister: false,
      includeAssets: [
        "icon.svg",
        "icon-square.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
        "manifest.webmanifest",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
    }),
  ],
});
