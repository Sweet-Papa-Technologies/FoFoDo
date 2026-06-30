import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// FoFoDo PWA (NFR-6). Output to dist/pwa to match firebase.json hosting.public.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar({ sassVariables: fileURLToPath(new URL("./src/quasar-variables.sass", import.meta.url)) }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // We ship our own firebase-messaging-sw.js for FCM web push (REQ-REM-01);
      // the generated SW handles offline app-shell caching (NFR-1/NFR-6).
      filename: "sw.js",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "FoFoDo",
        short_name: "FoFoDo",
        description: "A constraint-based task tracker. Capture anything, commit to three.",
        theme_color: "#0f1115",
        background_color: "#0f1115",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/mcp/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist/pwa",
    emptyOutDir: true,
    sourcemap: false,
  },
});
